"use client";
import { PostCard } from "./post-card";
import type { Post, PostLayout } from "./types";

interface PostsViewProps {
  posts: Post[];
  layout?: PostLayout;
}

export function PostsView({ posts, layout = "grid" }: PostsViewProps) {
  return (
    <div className="space-y-6">
      <div
        className={
          layout === "grid"
            ? "grid auto-rows-fr grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            : "flex flex-col"
        }
      >
        {posts.map((post) => (
          <PostCard key={post._id} layout={layout} post={post} />
        ))}
      </div>
    </div>
  );
}
