import type { TokenCipher } from "@delulu/core";
import { Effect, Schema } from "effect";
import { nanoid } from "nanoid";
import type {
  CallbackContext,
  ConnectionTemporaryStore,
  ConnectionUpsertResult,
} from "../../types";
import { LINKEDIN_VERSION } from "./constants";

export type LinkedInTargetType = "member" | "organization";

export interface LinkedInTarget {
  readonly id: string;
  readonly name: string;
  readonly username?: string;
  readonly type: LinkedInTargetType;
}

interface LinkedInSelection extends LinkedInTarget {
  readonly profileImage?: string;
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiresIn?: number;
  readonly refreshTokenExpiresIn?: number;
}

const LinkedInSelections = Schema.Array(
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    username: Schema.optional(Schema.String),
    profileImage: Schema.optional(Schema.String),
    type: Schema.Literals(["member", "organization"]),
    accessToken: Schema.String,
    refreshToken: Schema.optional(Schema.String),
    expiresIn: Schema.optional(Schema.Number),
    refreshTokenExpiresIn: Schema.optional(Schema.Number),
  })
);

interface OrganizationAclResponse {
  readonly elements?: ReadonlyArray<{
    readonly organization?: string;
    readonly organizationTarget?: string;
    readonly role?: string;
    readonly state?: string;
  }>;
  readonly paging?: {
    readonly links?: ReadonlyArray<{
      readonly rel?: string;
      readonly href?: string;
    }>;
  };
}

interface OrganizationResponse {
  readonly id?: number | string;
  readonly localizedName?: string;
  readonly vanityName?: string;
}

const POSTING_ROLES = new Set([
  "ADMINISTRATOR",
  "CONTENT_ADMINISTRATOR",
  "DIRECT_SPONSORED_CONTENT_POSTER",
]);
const ORGANIZATION_URN = /^urn:li:organization:(.+)$/;
const ORGANIZATION_LOOKUP_CONCURRENCY = 4;
const ORGANIZATION_DISCOVERY_TIMEOUT_MS = 10_000;
const MAX_ORGANIZATION_ACL_PAGES = 5;
const MAX_ORGANIZATIONS = 100;

const linkedinHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
  "LinkedIn-Version": LINKEDIN_VERSION,
  "X-Restli-Protocol-Version": "2.0.0",
});

const fetchLinkedInJson = async <T>(
  url: string,
  accessToken: string,
  deadline: number
) => {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) {
    throw new Error("LinkedIn Page discovery timed out");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), remainingMs);
  try {
    const response = await fetch(url, {
      redirect: "error",
      headers: linkedinHeaders(accessToken),
      signal: controller.signal,
    });
    const body = response.ok ? ((await response.json()) as T) : undefined;
    return { body, ok: response.ok, status: response.status } as const;
  } finally {
    clearTimeout(timeout);
  }
};

const organizationId = (urn: string): string | null => {
  const match = ORGANIZATION_URN.exec(urn);
  return match?.[1] ?? null;
};

/** Discover every Page where the authenticated member may publish. */
export async function discoverLinkedInOrganizations(
  accessToken: string
): Promise<readonly LinkedInTarget[]> {
  const deadline = Date.now() + ORGANIZATION_DISCOVERY_TIMEOUT_MS;
  const organizationUrns = new Set<string>();
  const visitedUrls = new Set<string>();
  let pageCount = 0;
  let nextUrl =
    "https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&state=APPROVED&count=100&start=0";

  while (
    nextUrl &&
    pageCount < MAX_ORGANIZATION_ACL_PAGES &&
    organizationUrns.size < MAX_ORGANIZATIONS &&
    !visitedUrls.has(nextUrl)
  ) {
    visitedUrls.add(nextUrl);
    pageCount += 1;
    const response = await fetchLinkedInJson<OrganizationAclResponse>(
      nextUrl,
      accessToken,
      deadline
    );
    if (!response.ok) {
      throw new Error(
        `LinkedIn organization access lookup failed (${response.status})`
      );
    }
    const body = response.body;
    if (!body) {
      throw new Error("LinkedIn organization access response was empty");
    }
    for (const item of body.elements ?? []) {
      const urn = item.organizationTarget ?? item.organization;
      if (
        urn?.startsWith("urn:li:organization:") &&
        item.state === "APPROVED" &&
        item.role &&
        POSTING_ROLES.has(item.role)
      ) {
        organizationUrns.add(urn);
        if (organizationUrns.size >= MAX_ORGANIZATIONS) {
          break;
        }
      }
    }
    const next = body.paging?.links?.find((link) => link.rel === "next")?.href;
    const candidate = next ? new URL(next, "https://api.linkedin.com") : null;
    nextUrl =
      candidate?.origin === "https://api.linkedin.com" &&
      !candidate.username &&
      !candidate.password
        ? candidate.toString()
        : "";
  }

  const urns = [...organizationUrns];
  const targets: LinkedInTarget[] = [];
  for (
    let start = 0;
    start < urns.length;
    start += ORGANIZATION_LOOKUP_CONCURRENCY
  ) {
    const batch = urns.slice(start, start + ORGANIZATION_LOOKUP_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(async (urn) => {
        const id = organizationId(urn);
        if (!id) {
          throw new Error("LinkedIn returned an invalid organization URN");
        }
        const response = await fetchLinkedInJson<OrganizationResponse>(
          `https://api.linkedin.com/rest/organizations/${encodeURIComponent(id)}`,
          accessToken,
          deadline
        );
        if (!response.ok) {
          throw new Error(
            `LinkedIn organization lookup failed (${response.status})`
          );
        }
        const organization = response.body;
        if (!organization) {
          throw new Error("LinkedIn organization response was empty");
        }
        return {
          id: urn,
          name: organization.localizedName ?? `LinkedIn Page ${id}`,
          username: organization.vanityName,
          type: "organization" as const,
        } satisfies LinkedInTarget;
      })
    );
    for (const [index, result] of settled.entries()) {
      if (result.status === "fulfilled") {
        targets.push(result.value);
      } else {
        console.error("LinkedIn Page metadata lookup failed:", result.reason);
        const urn = batch[index];
        const id = urn ? organizationId(urn) : undefined;
        if (urn && id) {
          targets.push({
            id: urn,
            name: `LinkedIn Page ${id}`,
            type: "organization",
          });
        }
      }
    }
  }
  return targets;
}

const selectionKey = (externalId: string, selectionId: string) =>
  `li-targets-${externalId}-${selectionId}`;

export async function storeLinkedInTargets(input: {
  readonly cipher: TokenCipher["Service"];
  readonly userId: string;
  readonly targets: readonly LinkedInSelection[];
  readonly temporaryStore: ConnectionTemporaryStore;
}): Promise<string> {
  const selectionId = nanoid(24);
  const encrypted = await Effect.runPromise(
    input.cipher.encrypt(JSON.stringify(input.targets))
  );
  await input.temporaryStore.put(
    selectionKey(input.userId, selectionId),
    encrypted.ciphertext,
    { expirationTtl: 600 }
  );
  return selectionId;
}

const loadLinkedInTargets = async (input: {
  readonly cipher: TokenCipher["Service"];
  readonly userId: string;
  readonly selectionId: string;
  readonly temporaryStore: ConnectionTemporaryStore;
}): Promise<readonly LinkedInSelection[]> => {
  const encrypted = await input.temporaryStore.get(
    selectionKey(input.userId, input.selectionId)
  );
  if (!encrypted) {
    throw new Error("LinkedIn account selection expired");
  }
  const decrypted = await Effect.runPromise(
    input.cipher.decrypt({ ciphertext: encrypted, cipherVersion: "v1" })
  );
  return Schema.decodeUnknownSync(LinkedInSelections)(JSON.parse(decrypted));
};

export async function listStoredLinkedInTargets(input: {
  readonly cipher: TokenCipher["Service"];
  readonly userId: string;
  readonly selectionId: string;
  readonly temporaryStore: ConnectionTemporaryStore;
}): Promise<readonly LinkedInTarget[]> {
  const targets = await loadLinkedInTargets(input);
  return targets.map(({ id, name, username, type }) => ({
    id,
    name,
    username,
    type,
  }));
}

export async function connectLinkedInTarget(input: {
  readonly cipher: TokenCipher["Service"];
  readonly userId: string;
  readonly selectionId: string;
  readonly targetId: string;
  readonly temporaryStore: ConnectionTemporaryStore;
  readonly upsert: CallbackContext["upsert"];
}): Promise<
  ConnectionUpsertResult & { readonly name: string; readonly profileId: string }
> {
  const targets = await loadLinkedInTargets(input);
  const target = targets.find((candidate) => candidate.id === input.targetId);
  if (!target) {
    throw new Error("Selected LinkedIn account is unavailable");
  }

  const result = await input.upsert({
    socialType: "LINKEDIN",
    accessToken: target.accessToken,
    refreshToken: target.refreshToken,
    expiresIn: target.expiresIn,
    refreshTokenExpiresIn: target.refreshTokenExpiresIn,
    profileId: target.id,
    username: target.username,
    fullName: target.name,
    profileImage: target.profileImage,
    metadata: { linkedinTargetType: target.type },
  });
  await input.temporaryStore.delete(
    selectionKey(input.userId, input.selectionId)
  );
  return { ...result, name: target.name, profileId: target.id };
}
