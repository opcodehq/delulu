import { Badge } from "@delulu/design-system/components/ui/badge";
import type { ComponentProps } from "react";
import type { PostStatus } from "@/shared/workspace-views";

type BadgeVariant = ComponentProps<typeof Badge>["variant"];

const statusConfig: Record<
  PostStatus,
  { label: string; variant: BadgeVariant }
> = {
  draft: { label: "Draft", variant: "zinc" },
  pending_review: { label: "In review", variant: "violet" },
  changes_requested: { label: "Changes requested", variant: "amber" },
  scheduled: { label: "Scheduled", variant: "blue" },
  publishing: { label: "Publishing", variant: "amber" },
  published: { label: "Published", variant: "green" },
  partially_failed: { label: "Partially failed", variant: "orange" },
  failed: { label: "Failed", variant: "red" },
};

export function PostStatusBadge({
  status,
  size,
}: {
  status: PostStatus;
  size?: ComponentProps<typeof Badge>["size"];
}) {
  const config = statusConfig[status] ?? {
    label: status,
    variant: "secondary" as const,
  };
  return (
    <Badge size={size} variant={config.variant}>
      {config.label}
    </Badge>
  );
}
