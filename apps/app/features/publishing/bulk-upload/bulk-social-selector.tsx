"use client";

import { Badge } from "@delulu/design-system/components/ui/badge";
import {
  AnimatePresence,
  LayoutGroup,
  MotionConfig,
  motion,
} from "motion/react";
import { IoCheckmarkCircle } from "react-icons/io5";
import type { SelectedProvider } from "@/features/publishing/bulk-upload/bulk-upload-reducer";
import { SocialIcon } from "@/features/publishing/editor/sidebar/social-icon";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspaceSelection } from "@/shell/providers/workspace";
import { useResourceAtom } from "@/shell/state/resources";

interface BulkSocialSelectorProps {
  selectedProviders: SelectedProvider[];
  onToggle: (provider: SelectedProvider) => void;
}

export function BulkSocialSelector({
  selectedProviders,
  onToggle,
}: BulkSocialSelectorProps) {
  const { workspaceId } = useWorkspaceSelection();
  const { resources } = useApiClient();
  const socialProviders = useResourceAtom({
    ...resources.connections.list(workspaceId ?? "", { limit: 100 }),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
    retry: 2,
  });

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-medium text-sm">Select Social Networks</h3>
      <MotionConfig transition={{ duration: 0.4, type: "spring", bounce: 0.2 }}>
        <motion.div className="grid grid-cols-1 gap-1">
          <LayoutGroup>
            <AnimatePresence initial={false} mode="popLayout">
              {socialProviders.data?.data.map((account) => {
                const isSelected = selectedProviders.some(
                  (p) => p.socialId === account.id
                );
                return (
                  <motion.div
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0 }}
                    key={account.id}
                    layout="position"
                  >
                    <motion.div layout>
                      <Badge
                        className="w-full cursor-pointer text-xs transition-colors duration-200"
                        onClick={() =>
                          onToggle({
                            socialId: account.id,
                            name:
                              account.displayName ??
                              account.username ??
                              account.profileId,
                            socialType:
                              account.platform as SelectedProvider["socialType"],
                          })
                        }
                        size="lg"
                        variant={isSelected ? "blue" : "outline"}
                      >
                        <motion.div
                          className="flex w-full items-center gap-2"
                          layout
                        >
                          <SocialIcon
                            type={
                              account.platform as SelectedProvider["socialType"]
                            }
                          />
                          <motion.span className="flex-1 text-left" layout>
                            {(
                              account.displayName ??
                              account.username ??
                              account.profileId
                            ).slice(0, 15)}
                          </motion.span>
                          {isSelected && (
                            <motion.span
                              animate={{ scale: 1 }}
                              className="ml-1"
                              initial={{ scale: 0 }}
                            >
                              <IoCheckmarkCircle className="h-4 w-4" />
                            </motion.span>
                          )}
                        </motion.div>
                      </Badge>
                    </motion.div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </LayoutGroup>
        </motion.div>
      </MotionConfig>
      {socialProviders.data?.data.length === 0 && (
        <p className="text-muted-foreground text-xs">
          No connected accounts. Connect a social account first.
        </p>
      )}
    </div>
  );
}
