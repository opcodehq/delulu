import { makeTokenCipher } from "@delulu/core";
import axios from "axios";
import { Effect, Layer } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectionStore } from "../../services/connection-store";
import { linkedinAuth } from "./auth";
import { LINKEDIN_VERSION } from "./constants";
import { linkedinPublisher } from "./publish";
import {
  connectLinkedInTarget,
  discoverLinkedInOrganizations,
  listStoredLinkedInTargets,
  storeLinkedInTargets,
} from "./targets";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("LinkedIn current API contract", () => {
  it("keeps an authorized Page selectable when its display metadata is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            elements: [
              {
                organization: "urn:li:organization:123",
                role: "ADMINISTRATOR",
                state: "APPROVED",
              },
            ],
          })
        )
        .mockResolvedValueOnce(new Response(null, { status: 403 }))
    );
    await expect(discoverLinkedInOrganizations("access")).resolves.toEqual([
      {
        id: "urn:li:organization:123",
        name: "LinkedIn Page 123",
        type: "organization",
      },
    ]);
  });
  it("requests current member and organization publishing scopes", async () => {
    vi.stubEnv("LINKEDIN_CLIENT_ID", "client");
    vi.stubEnv("LINKEDIN_CALLBACK_URL", "https://app.test/callback");

    const url = new URL(
      await linkedinAuth.getConnectUrl({ state: "signed-state" })
    );

    expect(LINKEDIN_VERSION).toBe("202607");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([
      "openid",
      "profile",
      "w_member_social",
      "rw_organization_admin",
      "w_organization_social",
    ]);
    expect(url.searchParams.get("state")).toBe("signed-state");
  });

  it("discovers only approved Pages with publishing roles", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              elements: [
                {
                  organizationTarget: "urn:li:organization:123",
                  role: "CONTENT_ADMINISTRATOR",
                  state: "APPROVED",
                },
                {
                  organizationTarget: "urn:li:organization:999",
                  role: "ANALYST",
                  state: "APPROVED",
                },
              ],
              paging: { links: [] },
            }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 123,
              localizedName: "Example Page",
              vanityName: "example-page",
            }),
            { status: 200 }
          )
        )
    );

    await expect(discoverLinkedInOrganizations("access")).resolves.toEqual([
      {
        id: "urn:li:organization:123",
        name: "Example Page",
        username: "example-page",
        type: "organization",
      },
    ]);
  });

  it("stops organization ACL discovery when LinkedIn repeats a page", async () => {
    const firstPage =
      "https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&state=APPROVED&count=100&start=0";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          elements: [],
          paging: { links: [{ rel: "next", href: firstPage }] },
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(discoverLinkedInOrganizations("access")).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    "https://untrusted.test/next",
    "http://api.linkedin.com/next",
    "//untrusted.test/next",
  ])("never forwards credentials to pagination origin %s", async (href) => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        elements: [],
        paging: { links: [{ rel: "next", href }] },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(discoverLinkedInOrganizations("access")).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: "error" });
  });

  it("follows relative LinkedIn pagination links", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          elements: [],
          paging: {
            links: [{ rel: "next", href: "/rest/organizationAcls?start=100" }],
          },
        })
      )
      .mockResolvedValueOnce(Response.json({ elements: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await discoverLinkedInOrganizations("access");
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://api.linkedin.com/rest/organizationAcls?start=100"
    );
  });

  it("uses the injected cipher for both writing and reading temporary credentials", async () => {
    vi.stubEnv("ENCRYPTION_SECRET", "");
    const values = new Map<string, string>();
    const temporaryStore = {
      get: async (key: string) => values.get(key) ?? null,
      put: async (key: string, value: string) => {
        values.set(key, value);
      },
      delete: async (key: string) => {
        values.delete(key);
      },
    };
    const cipher = makeTokenCipher("runtime-specific-secret");
    const selectionId = await storeLinkedInTargets({
      cipher,
      userId: "user",
      temporaryStore,
      targets: [
        {
          id: "member",
          name: "Member",
          type: "member",
          accessToken: "sensitive-token",
        },
      ],
    });
    expect([...values.values()][0]).not.toContain("sensitive-token");
    await expect(
      listStoredLinkedInTargets({
        cipher,
        userId: "user",
        temporaryStore,
        selectionId,
      })
    ).resolves.toEqual([
      { id: "member", name: "Member", type: "member", username: undefined },
    ]);
    await expect(
      listStoredLinkedInTargets({
        cipher: makeTokenCipher(""),
        userId: "user",
        temporaryStore,
        selectionId,
      })
    ).rejects.toThrow();
  });

  it("persists OIDC userinfo and partner refresh tokens when returned", async () => {
    vi.stubEnv("LINKEDIN_CLIENT_ID", "client");
    vi.stubEnv("LINKEDIN_CLIENT_SECRET", "secret");
    vi.stubEnv("LINKEDIN_CALLBACK_URL", "https://app.test/callback");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              access_token: "access",
              expires_in: 3600,
              refresh_token: "refresh",
              refresh_token_expires_in: 7200,
            }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              sub: "member_1",
              name: "Test Member",
              picture: "https://media.example.test/profile.jpg",
            }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ elements: [], paging: { links: [] } }),
            {
              status: 200,
            }
          )
        )
    );
    const upsert = vi.fn().mockResolvedValue({ status: "created" });
    const values = new Map<string, string>();
    const temporaryStore = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      put: vi.fn(async (key: string, value: string) => {
        values.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        values.delete(key);
      }),
    };
    const cipher = makeTokenCipher("injected test secret");
    const before = Date.now();
    const response = await linkedinAuth.handleCallback({
      tokenCipher: cipher,
      code: "authorization-code",
      error: null,
      errorReason: null,
      state: "signed-state",
      userId: "user_1",
      upsert,
      temporaryStore,
    });
    const location = new URL(response.headers.get("Location") ?? "");
    expect(location.pathname).toBe("/linkedin-account-select");
    expect(upsert).not.toHaveBeenCalled();
    await connectLinkedInTarget({
      cipher,
      userId: "user_1",
      selectionId: location.searchParams.get("selection") ?? "",
      targetId: "member_1",
      temporaryStore,
      upsert,
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        socialType: "LINKEDIN",
        profileId: "member_1",
        fullName: "Test Member",
        profileImage: "https://media.example.test/profile.jpg",
        accessToken: "access",
        refreshToken: "refresh",
        refreshTokenExpiresIn: expect.any(Number),
      })
    );
    expect(vi.mocked(fetch).mock.calls[1]?.[0]).toBe(
      "https://api.linkedin.com/v2/userinfo"
    );
    expect(upsert.mock.calls[0]?.[0].expiresIn).toBeGreaterThanOrEqual(
      before + 3_600_000
    );
    expect(
      upsert.mock.calls[0]?.[0].refreshTokenExpiresIn
    ).toBeGreaterThanOrEqual(before + 7_200_000);
  });

  it("keeps personal connection available when Page discovery fails", async () => {
    vi.stubEnv("LINKEDIN_CLIENT_ID", "client");
    vi.stubEnv("LINKEDIN_CLIENT_SECRET", "secret");
    vi.stubEnv("LINKEDIN_CALLBACK_URL", "https://app.test/callback");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ access_token: "access", expires_in: 3600 }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ sub: "member_1", name: "Test Member" }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
    );
    const upsert = vi.fn().mockResolvedValue({ status: "created" });

    const response = await linkedinAuth.handleCallback({
      tokenCipher: makeTokenCipher("injected test secret"),
      code: "authorization-code",
      error: null,
      errorReason: null,
      state: "signed-state",
      userId: "user_1",
      upsert,
      temporaryStore: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      },
    });

    expect(upsert).not.toHaveBeenCalled();
    expect(new URL(response.headers.get("Location") ?? "").pathname).toBe(
      "/linkedin-account-select"
    );
    expect(
      new URL(response.headers.get("Location") ?? "").searchParams.get("pages")
    ).toBe("unavailable");
  });

  it("offers the member and managed Pages before persisting a target", async () => {
    vi.stubEnv("LINKEDIN_CLIENT_ID", "client");
    vi.stubEnv("LINKEDIN_CLIENT_SECRET", "secret");
    vi.stubEnv("LINKEDIN_CALLBACK_URL", "https://app.test/callback");
    vi.stubEnv("ENCRYPTION_SECRET", "a stable test secret");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ access_token: "access", expires_in: 3600 }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ sub: "member_1", name: "Test Member" }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              elements: [
                {
                  organizationTarget: "urn:li:organization:123",
                  role: "ADMINISTRATOR",
                  state: "APPROVED",
                },
              ],
              paging: { links: [] },
            }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ id: 123, localizedName: "Example Page" }),
            { status: 200 }
          )
        )
    );
    const put = vi.fn().mockResolvedValue(undefined);
    const upsert = vi.fn();

    const response = await linkedinAuth.handleCallback({
      tokenCipher: makeTokenCipher("injected test secret"),
      code: "authorization-code",
      error: null,
      errorReason: null,
      state: "signed-state",
      userId: "user_1",
      upsert,
      temporaryStore: {
        get: vi.fn().mockResolvedValue(null),
        put,
        delete: vi.fn().mockResolvedValue(undefined),
      },
    });

    const location = new URL(response.headers.get("Location") ?? "");
    expect(location.pathname).toBe("/linkedin-account-select");
    expect(location.searchParams.get("state")).toBe("signed-state");
    expect(location.searchParams.get("selection")).toBeTruthy();
    expect(put).toHaveBeenCalledOnce();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("persists the selected Page with its organization author type", async () => {
    vi.stubEnv("ENCRYPTION_SECRET", "a stable test secret");
    const values = new Map<string, string>();
    const temporaryStore = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      put: vi.fn(async (key: string, value: string) => {
        values.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        values.delete(key);
      }),
    };
    const selectionId = await storeLinkedInTargets({
      cipher: makeTokenCipher("injected test secret"),
      userId: "user_1",
      temporaryStore,
      targets: [
        {
          id: "urn:li:organization:123",
          name: "Example Page",
          username: "example-page",
          type: "organization",
          accessToken: "access",
        },
      ],
    });
    const upsert = vi.fn().mockResolvedValue({ status: "created" });

    await expect(
      connectLinkedInTarget({
        cipher: makeTokenCipher("injected test secret"),
        userId: "user_1",
        selectionId,
        targetId: "urn:li:organization:123",
        temporaryStore,
        upsert,
      })
    ).resolves.toEqual({
      status: "created",
      name: "Example Page",
      profileId: "urn:li:organization:123",
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: "urn:li:organization:123",
        metadata: { linkedinTargetType: "organization" },
      })
    );
    expect(values.size).toBe(0);
  });

  it("publishes through the Posts API as an organization connection", async () => {
    const Store = Layer.succeed(ConnectionStore, {
      getSocialProviderWithDecryptedTokens: () =>
        Effect.succeed({
          _id: "connection_linkedin_page",
          socialType: "LINKEDIN" as const,
          accessToken: "current-access",
          profileId: "urn:li:organization:123",
          username: "example-page",
          linkedinTargetType: "organization" as const,
        }),
      updateSocialProvider: () => Effect.void,
    });
    const post = vi.spyOn(axios, "post").mockResolvedValue({
      headers: { "x-restli-id": "urn:li:share:page_post" },
      data: {},
    });

    await Effect.runPromise(
      linkedinPublisher
        .publish({
          socialProviderId: "connection_linkedin_page",
          content: {
            postId: "post_page",
            socialProviderId: "connection_linkedin_page",
            content: [
              {
                order: 0,
                name: "Post",
                text: "Hello from the Page",
                tags: [],
                media: [],
              },
            ],
          },
        })
        .pipe(Effect.provide(Store))
    );

    expect(post.mock.calls[0]?.[0]).toBe("https://api.linkedin.com/rest/posts");
    expect(post.mock.calls[0]?.[1]).toMatchObject({
      author: "urn:li:organization:123",
    });
  });

  it("refreshes and persists an expiring partner token before publishing", async () => {
    vi.stubEnv("LINKEDIN_CLIENT_ID", "client");
    vi.stubEnv("LINKEDIN_CLIENT_SECRET", "secret");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "fresh-access",
            expires_in: 3600,
            refresh_token: "fresh-refresh",
            refresh_token_expires_in: 7200,
          }),
          { status: 200 }
        )
      )
    );
    const update = vi.fn(() => Effect.void);
    const Store = Layer.succeed(ConnectionStore, {
      getSocialProviderWithDecryptedTokens: () =>
        Effect.succeed({
          _id: "connection_linkedin",
          socialType: "LINKEDIN" as const,
          accessToken: "stale-access",
          refreshToken: "current-refresh",
          expiresIn: Date.now() + 30_000,
          profileId: "member_1",
          username: "test-member",
        }),
      updateSocialProvider: update,
    });
    const post = vi.spyOn(axios, "post").mockResolvedValue({
      headers: { "x-restli-id": "urn:li:share:1" },
      data: {},
    });

    const result = await Effect.runPromise(
      linkedinPublisher
        .publish({
          socialProviderId: "connection_linkedin",
          content: {
            postId: "post_1",
            socialProviderId: "connection_linkedin",
            content: [
              {
                order: 0,
                name: "Post",
                text: "Hello LinkedIn",
                tags: [],
                media: [],
              },
            ],
          },
        })
        .pipe(Effect.provide(Store))
    );

    expect(result.platformPostId).toBe("urn:li:share:1");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        socialProviderId: "connection_linkedin",
        accessToken: "fresh-access",
        refreshToken: "fresh-refresh",
      })
    );
    expect(
      (post.mock.calls[0]?.[2]?.headers as Record<string, string> | undefined)
        ?.Authorization
    ).toBe("Bearer fresh-access");
  });

  it("waits for a document to become available before creating the post", async () => {
    const Store = Layer.succeed(ConnectionStore, {
      getSocialProviderWithDecryptedTokens: () =>
        Effect.succeed({
          _id: "connection_linkedin",
          socialType: "LINKEDIN" as const,
          accessToken: "current-access",
          expiresIn: Date.now() + 12 * 60 * 60 * 1000,
          profileId: "member_1",
          username: "test-member",
        }),
      updateSocialProvider: () => Effect.void,
    });
    const get = vi
      .spyOn(axios, "get")
      .mockResolvedValueOnce({ data: { status: "AVAILABLE" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        String(url).includes("uploads.linkedin.test")
          ? new Response(null, { status: 201 })
          : new Response("media", { headers: { "content-length": "5" } })
      )
    );
    const post = vi
      .spyOn(axios, "post")
      .mockResolvedValueOnce({
        data: {
          value: {
            uploadUrl: "https://uploads.linkedin.test/document",
            document: "urn:li:document:doc_1",
          },
        },
      })
      .mockResolvedValueOnce({
        headers: { "x-restli-id": "urn:li:share:document_post" },
        data: {},
      });

    await Effect.runPromise(
      linkedinPublisher
        .publish({
          socialProviderId: "connection_linkedin",
          content: {
            postId: "post_document",
            socialProviderId: "connection_linkedin",
            content: [
              {
                order: 0,
                name: "Document",
                text: "Document post",
                tags: [],
                media: [
                  {
                    mediaType: "DOCUMENT",
                    url: "https://media.example.test/deck.pptx",
                    altText: "Quarterly deck",
                  },
                ],
              },
            ],
          },
        })
        .pipe(Effect.provide(Store))
    );

    expect(get.mock.calls[0]?.[0]).toBe(
      "https://api.linkedin.com/rest/documents/urn%3Ali%3Adocument%3Adoc_1"
    );
    expect(post.mock.calls[1]?.[0]).toBe("https://api.linkedin.com/rest/posts");
  });

  it("publishes an image using the current Posts API media shape", async () => {
    const Store = Layer.succeed(ConnectionStore, {
      getSocialProviderWithDecryptedTokens: () =>
        Effect.succeed({
          _id: "connection_linkedin",
          socialType: "LINKEDIN" as const,
          accessToken: "current-access",
          profileId: "member_1",
          username: "test-member",
        }),
      updateSocialProvider: () => Effect.void,
    });
    vi.spyOn(axios, "get").mockResolvedValue({ data: Buffer.from("image") });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        String(url).includes("uploads.linkedin.test")
          ? new Response(null, { status: 201 })
          : new Response("media", { headers: { "content-length": "5" } })
      )
    );
    const post = vi
      .spyOn(axios, "post")
      .mockResolvedValueOnce({
        data: {
          value: {
            uploadUrl: "https://uploads.linkedin.test/image",
            image: "urn:li:image:image_1",
          },
        },
      })
      .mockResolvedValueOnce({
        headers: { "x-restli-id": "urn:li:share:image_post" },
        data: {},
      });

    await Effect.runPromise(
      linkedinPublisher
        .publish({
          socialProviderId: "connection_linkedin",
          content: {
            postId: "post_image",
            socialProviderId: "connection_linkedin",
            content: [
              {
                order: 0,
                name: "Image",
                text: "Image post",
                tags: [],
                media: [
                  {
                    mediaType: "IMAGE",
                    url: "https://media.example.test/image.jpg",
                    altText: "Product image",
                  },
                ],
              },
            ],
          },
        })
        .pipe(Effect.provide(Store))
    );

    expect(post.mock.calls[1]?.[1]).toMatchObject({
      content: {
        media: { id: "urn:li:image:image_1" },
      },
    });
  });

  it("rejects a create response that has no durable post ID", async () => {
    const Store = Layer.succeed(ConnectionStore, {
      getSocialProviderWithDecryptedTokens: () =>
        Effect.succeed({
          _id: "connection_linkedin",
          socialType: "LINKEDIN" as const,
          accessToken: "current-access",
          profileId: "member_1",
          username: "test-member",
        }),
      updateSocialProvider: () => Effect.void,
    });
    vi.spyOn(axios, "post").mockResolvedValue({ headers: {}, data: {} });

    await expect(
      Effect.runPromise(
        linkedinPublisher
          .publish({
            socialProviderId: "connection_linkedin",
            content: {
              postId: "post_missing_id",
              socialProviderId: "connection_linkedin",
              content: [
                {
                  order: 0,
                  name: "Post",
                  text: "No ID",
                  tags: [],
                  media: [],
                },
              ],
            },
          })
          .pipe(Effect.provide(Store))
      )
    ).rejects.toMatchObject({ code: "PUBLISH_REJECTED" });
  });
});
