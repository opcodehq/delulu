"use client";

import { useAuth } from "@delulu/auth";
import { type ApiClient, runEffect } from "@delulu/client";
import type { Effect } from "effect";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPublicApiClient } from "@/shell/public-api-client";

export type SharedPost = Effect.Success<
  ReturnType<ApiClient["publicShares"]["view"]>
>;
export type SharedComment = SharedPost["comments"][number];

export type SharedPostState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly post: SharedPost }
  | { readonly status: "sign-in" }
  | { readonly status: "forbidden" }
  | { readonly status: "expired" }
  | { readonly status: "missing" }
  | { readonly status: "error" };

const tagOf = (error: unknown) =>
  typeof error === "object" && error !== null && "_tag" in error
    ? String((error as { _tag: unknown })._tag)
    : null;

const stateForError = (error: unknown): SharedPostState => {
  switch (tagOf(error)) {
    case "UnauthorizedError":
      return { status: "sign-in" };
    case "ForbiddenError":
      return { status: "forbidden" };
    case "ShareLinkExpiredError":
      return { status: "expired" };
    case "NotFoundError":
      return { status: "missing" };
    default:
      return { status: "error" };
  }
};

/**
 * Loads a shared post. Signed-in visitors use their session (required for
 * members-only links and to comment under their own name); everyone else uses
 * the public endpoint. Refetches when the tab regains focus so the preview
 * always reflects the latest edits.
 */
export function useSharedPost(token: string) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const client = useMemo(() => createPublicApiClient(getToken), [getToken]);
  const [state, setState] = useState<SharedPostState>({ status: "loading" });
  const latestRequest = useRef(0);
  const signedIn = Boolean(isSignedIn);

  const load = useCallback(async () => {
    const request = ++latestRequest.current;
    try {
      const params = { params: { token } };
      const post = await runEffect(
        signedIn
          ? client.shareLinks.view(params)
          : client.publicShares.view(params)
      );
      if (request === latestRequest.current) {
        setState({ status: "ready", post });
      }
    } catch (error) {
      if (request === latestRequest.current) {
        // Keep showing content on a transient refetch failure.
        setState((current) =>
          current.status === "ready" && stateForError(error).status === "error"
            ? current
            : stateForError(error)
        );
      }
    }
  }, [client, signedIn, token]);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }
    load();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        load();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [isLoaded, load]);

  const addComment = useCallback(
    async (input: { body: string; authorName: string }) => {
      const comment = await runEffect(
        signedIn
          ? client.shareLinks.comment({
              params: { token },
              payload: { body: input.body },
            })
          : client.publicShares.comment({
              params: { token },
              payload: input,
            })
      ).catch((error: unknown) => {
        const next = stateForError(error);
        if (next.status !== "error") {
          setState(next);
        }
        throw error;
      });
      setState((current) =>
        current.status === "ready"
          ? {
              status: "ready",
              post: {
                ...current.post,
                comments: [...current.post.comments, comment],
              },
            }
          : current
      );
      return comment;
    },
    [client, signedIn, token]
  );

  return { state, reload: load, addComment, signedIn };
}
