import { makeTokenCipher } from "@delulu/core";
import {
  type FacebookPagesWithToken,
  FacebookPagesWithTokenSchema,
} from "@delulu/core/publishing/facebook";
import { Effect } from "effect";
import { nanoid } from "nanoid";
import { callbackRedirect } from "../../callback-response";
import type {
  CallbackContext,
  ConnectContext,
  PlatformAuth,
} from "../../types";
import { GRAPH_VERSION } from "./constants";

const fbEnv = () => ({
  clientId: process.env.FACEBOOK_CLIENT_ID ?? "",
  clientSecret: process.env.FACEBOOK_CLIENT_SECRET ?? "",
  callbackUrl: process.env.FACEBOOK_CALLBACK_URL ?? "",
});

/**
 * 302 redirect helper — preserves the EXACT Location/error codes the old
 * Next.js callback route used so the `/socials` and `/facebook-page-select`
 * pages keep working unchanged.
 */
const fetchTimeout = (url: string, init?: RequestInit, timeoutMs = 15_000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
};

interface FacebookTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}
interface FacebookLongLivedTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}
interface FacebookPageResponse {
  data: Array<{
    access_token: string;
    category: string;
    category_list: Array<{ id: string; name: string }>;
    name: string;
    id: string;
    tasks: string[];
    picture: {
      data: {
        url: string;
        width: number;
        height: number;
        is_silhouette: boolean;
      };
    };
    cover: { id: string; source: string; offset_y: number };
    link: string;
    followers_count: number;
    fan_count: number;
    verification_status: string;
  }>;
  paging?: { cursors: { before: string; after: string }; next?: string };
}

/** Walk the `me/accounts` pagination cursor to collect every managed page. */
async function getAllPages(
  accessToken: string
): Promise<FacebookPageResponse["data"]> {
  let allPages: FacebookPageResponse["data"] = [];
  let nextUrl = `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?fields=access_token,category,category_list,name,id,tasks,picture{url,width,height,is_silhouette},cover,link,followers_count,fan_count,verification_status&access_token=${accessToken}`;

  while (nextUrl) {
    const response = await fetchTimeout(nextUrl, { method: "GET" });
    if (!response.ok) {
      console.error("Facebook pages fetch failed:", await response.text());
      throw new Error("Failed to fetch Facebook pages");
    }
    const pagesData = (await response.json()) as FacebookPageResponse;
    allPages = [...allPages, ...pagesData.data];
    nextUrl = pagesData.paging?.next || "";
  }

  return allPages;
}

const BASE_SCOPES = [
  "public_profile",
  "pages_show_list",
  "pages_manage_posts",
  "business_management",
  "publish_video",
];

export const facebookAuth: PlatformAuth = {
  scopes: BASE_SCOPES,
  isMultiStep: true,

  getConnectUrl(ctx?: ConnectContext): string {
    const e = fbEnv();
    const params = new URLSearchParams({
      client_id: e.clientId,
      redirect_uri: e.callbackUrl,
      response_type: "code",
      scope: BASE_SCOPES.join(","),
      state: ctx?.state ?? JSON.stringify({ state: nanoid(10) }),
    });
    return `https://www.facebook.com/dialog/oauth?${params.toString()}`;
  },

  /**
   * OAuth callback — the multi-step (page-picker) case. Exchanges the code for
   * a long-lived user token, lists every managed page, encrypts + stores that
   * list in Cloudflare KV (`DELULU_FACEBOOK_PAGES`) keyed by user+code, then
   * redirects to `/facebook-page-select`. The chosen page's token is later
   * finalised by `connectFacebookPage` (below). Error codes/redirects mirror
   * the old Next.js route exactly.
   */
  async handleCallback(ctx: CallbackContext): Promise<Response> {
    const { code, error, errorReason, userId } = ctx;
    const e = fbEnv();

    if (error === "access_denied" && errorReason === "user_denied") {
      return callbackRedirect(
        "/socials?error=user_denied&code=FACEBOOK_001&provider=facebook"
      );
    }
    if (!code) {
      return callbackRedirect(
        "/socials?error=invalid_request&code=PARAM_001&provider=facebook"
      );
    }

    try {
      // 1. Short-lived token
      const tokenUrl = new URL(
        `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`
      );
      tokenUrl.searchParams.append("client_id", e.clientId);
      tokenUrl.searchParams.append("redirect_uri", e.callbackUrl);
      tokenUrl.searchParams.append("client_secret", e.clientSecret);
      tokenUrl.searchParams.append("code", code);

      const tokenRequest = await fetchTimeout(tokenUrl.toString(), {
        method: "GET",
      });
      if (!tokenRequest.ok) {
        console.error(
          "Facebook token exchange failed:",
          await tokenRequest.text()
        );
        return callbackRedirect(
          "/socials?error=token_invalid&code=FACEBOOK_002&provider=facebook"
        );
      }
      const tokenData = (await tokenRequest.json()) as FacebookTokenResponse;

      // 2. Long-lived token
      const longLivedTokenUrl = new URL(
        `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`
      );
      longLivedTokenUrl.searchParams.append("grant_type", "fb_exchange_token");
      longLivedTokenUrl.searchParams.append("client_id", e.clientId);
      longLivedTokenUrl.searchParams.append("client_secret", e.clientSecret);
      longLivedTokenUrl.searchParams.append(
        "fb_exchange_token",
        tokenData.access_token
      );

      const longLivedTokenResponse = await fetchTimeout(
        longLivedTokenUrl.toString(),
        { method: "GET" }
      );
      if (!longLivedTokenResponse.ok) {
        console.error(
          "Facebook long-lived token exchange failed:",
          await longLivedTokenResponse.text()
        );
        return callbackRedirect(
          "/socials?error=token_invalid&code=FACEBOOK_003&provider=facebook"
        );
      }
      const longLivedTokenData =
        (await longLivedTokenResponse.json()) as FacebookLongLivedTokenResponse;

      // 3. List every managed page, then stash it in KV for the page picker.
      try {
        const allPages = await getAllPages(longLivedTokenData.access_token);
        if (!allPages || allPages.length === 0) {
          return callbackRedirect(
            "/socials?error=no_pages_found&code=FACEBOOK_005&provider=facebook"
          );
        }

        const key = `fb-pages-${userId}-${code}`;
        const cipher = makeTokenCipher(process.env.ENCRYPTION_SECRET ?? "");
        const encrypted = await Effect.runPromise(
          cipher.encrypt(JSON.stringify(allPages))
        );
        await ctx.temporaryStore.put(key, encrypted.ciphertext, {
          expirationTtl: 600, // 10 minutes
        });

        // Redirect to the page-selection UI with the KV data key.
        return callbackRedirect(
          `/facebook-page-select?key=${encodeURIComponent(key)}&code=${encodeURIComponent(code)}&state=${encodeURIComponent(ctx.state ?? "")}`
        );
      } catch (pagesError) {
        console.error("Error fetching Facebook pages:", pagesError);
        return callbackRedirect(
          "/socials?error=pages_fetch_failed&code=FACEBOOK_004&provider=facebook"
        );
      }
    } catch (err) {
      console.error("Facebook callback error:", err);
      return callbackRedirect(
        "/socials?error=server_error&code=FACEBOOK_500&provider=facebook"
      );
    }
  },
};

// ── Page picker (multi-step step 2) ─────────────────────────────────────────

export interface ConnectFacebookPageInput {
  /** The OAuth `code` used to key the KV entry (`fb-pages-<externalId>-<code>`). */
  code: string;
  pageId: string;
  pageName: string;
  /** External (Clerk) user id used to build the KV key. */
  externalId: string;
  upsert: CallbackContext["upsert"];
  temporaryStore: CallbackContext["temporaryStore"];
}

export type ConnectFacebookPageResult =
  | { readonly status: "connected" }
  | {
      readonly status: "transfer_required";
      readonly connectionId: string;
      readonly sourceWorkspaceId: string;
    };

/**
 * Finalises a Facebook connection after the user picks a page. Reads the
 * encrypted page list from Cloudflare KV, decrypts it, extracts the selected
 * page's access token, deletes the KV entry, then persists the connection.
 *
 * Exported as a STANDALONE async function (and re-exported named below) rather
 * than a `PlatformAuth` method because `PlatformAuth`/`types.ts` has no
 * `onConnectStep` hook and must not be edited.
 */
export async function connectFacebookPage(
  input: ConnectFacebookPageInput
): Promise<ConnectFacebookPageResult> {
  const key = `fb-pages-${input.externalId}-${input.code}`;
  const facebookPagesKV = input.temporaryStore;

  const encryptedData = await facebookPagesKV.get(key);
  if (!encryptedData) {
    throw new Error("Facebook pages data not found or expired");
  }

  const cipher = makeTokenCipher(process.env.ENCRYPTION_SECRET ?? "");
  const decryptedData = await Effect.runPromise(
    cipher.decrypt({ ciphertext: encryptedData, cipherVersion: "v1" })
  );
  const rawPages = JSON.parse(decryptedData);

  const parsed = FacebookPagesWithTokenSchema.safeParse(rawPages);
  if (!parsed.success) {
    throw new Error("Invalid Facebook pages data structure");
  }
  const pages: FacebookPagesWithToken = parsed.data;

  const selectedPage = pages.find((page) => page.id === input.pageId);
  if (!selectedPage?.access_token) {
    throw new Error("Selected Facebook page not found");
  }
  const pageAccessToken = selectedPage.access_token;

  // Clean up the one-time KV entry once the token has been extracted.
  await facebookPagesKV.delete(key);

  const result = await input.upsert({
    socialType: "FACEBOOK",
    accessToken: pageAccessToken,
    profileId: input.pageId,
    username: input.pageName,
    fullName: input.pageName,
  });
  return result.status === "transfer_required"
    ? result
    : { status: "connected" };
}
