"use client";

import { formatDistanceToNow } from "date-fns";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspace } from "@/shell/providers/workspace";
import { useResourceAtom } from "@/shell/state/resources";

/** Comments left through the post's share link, newest last. */
export function ShareFeedback({ postId }: { postId: string }) {
  const { workspaceId } = useWorkspace();
  const { resources } = useApiClient();
  const comments = useResourceAtom({
    ...resources.shares.comments(workspaceId ?? "", postId),
    enabled: Boolean(workspaceId),
  });
  const items = comments.data ?? [];

  if (items.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="share-feedback-title" className="space-y-2 p-4">
      <h3 className="font-medium text-sm" id="share-feedback-title">
        Shared-link feedback
        <span className="ml-2 font-normal text-muted-foreground tabular-nums">
          {items.length}
        </span>
      </h3>
      <ol className="space-y-3">
        {items.map((comment) => (
          <li className="space-y-0.5" key={comment.id}>
            <p className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate font-medium text-foreground">
                {comment.authorName}
              </span>
              <time
                className="shrink-0 text-muted-foreground"
                dateTime={comment.createdAt}
              >
                {formatDistanceToNow(new Date(comment.createdAt), {
                  addSuffix: true,
                })}
              </time>
            </p>
            <p className="whitespace-pre-wrap break-words text-sm leading-6">
              {comment.body}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
