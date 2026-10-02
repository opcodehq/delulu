"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@delulu/design-system/components/ui/card";
import { Icon } from "@delulu/design-system/providers/icon";
import {
  Comment01Icon,
  FavouriteIcon,
  Image01Icon,
  Time01Icon,
  ViewIcon,
} from "@delulu/icons";
import type { InsightPost } from "./analytics-content";

interface TopPostsListProps {
  posts: readonly InsightPost[];
  isLoading: boolean;
}

function formatNumber(n: number | undefined): string {
  if (n === undefined) {
    return "-";
  }
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}K`;
  }
  return String(n);
}

function formatDate(timestamp: string | undefined): string {
  if (!timestamp) {
    return "";
  }
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatWatchTime(ms: number | undefined): string {
  if (!ms) {
    return "";
  }
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

export function TopPostsList({ posts, isLoading }: TopPostsListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Top Performing Posts</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <p className="text-muted-foreground text-sm">Loading posts...</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="mb-4 rounded-full bg-muted/50 p-4">
              <Icon
                className="text-muted-foreground"
                icon={Image01Icon}
                size={24}
              />
            </div>
            <p className="text-muted-foreground">No post data yet</p>
            <p className="text-muted-foreground text-sm">
              Post insights will appear after syncing
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {posts.map((post) => {
              return (
                <a
                  className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                  href={post.permalink ?? "#"}
                  key={post.id}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {/* Thumbnail */}
                  <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                    <div className="flex h-full w-full items-center justify-center">
                      <Icon
                        className="text-muted-foreground"
                        icon={Image01Icon}
                        size={16}
                      />
                    </div>
                  </div>

                  {/* Caption + date */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {post.caption || "No caption"}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">
                        {formatDate(post.publishedAt)}
                      </span>
                      {post.mediaType === "VIDEO" && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          Reel
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="flex flex-shrink-0 items-center gap-3 text-muted-foreground text-xs">
                    <span className="flex items-center gap-1">
                      <Icon icon={ViewIcon} size={12} />
                      {formatNumber(post.impressions)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Icon icon={FavouriteIcon} size={12} />
                      {formatNumber(post.reach)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Icon icon={Comment01Icon} size={12} />
                      {formatNumber(post.engagements)}
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
