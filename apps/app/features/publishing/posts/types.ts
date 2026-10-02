// Shared composer types.
export type { Post, PostLayout } from "@/shared/backend";

export const statusColors = {
  SAVED: "orange",
  SCHEDULED: "amber",
  PUBLISHED: "green",
  DELETED: "red",
  FAILED: "destructive",
  PROCESSING: "purple",
} as const;
