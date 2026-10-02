"use client";
import { createLiveblocksClient } from "@delulu/collaboration/config";
import { Room } from "@delulu/collaboration/room";
import type { ReactNode } from "react";
import { useMemo } from "react";

export const CollaborationProvider = ({
  orgId,
  children,
}: {
  orgId: string;
  children: ReactNode;
}) => {
  const client = useMemo(() => createLiveblocksClient(), []);

  return (
    <Room
      authEndpoint="/api/collaboration/auth"
      fallback={
        <div className="px-3 text-muted-foreground text-xs">Loading...</div>
      }
      id={`${orgId}:presence`}
      {...client}
    >
      {children}
    </Room>
  );
};
