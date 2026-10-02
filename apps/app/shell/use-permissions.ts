"use client";

import { useOrganization } from "@delulu/auth";

export function usePermissions() {
  const { membership } = useOrganization();
  const orgRole = membership?.role;
  const isPersonal = !orgRole;

  return {
    canPublish: isPersonal || orgRole === "org:admin",
    canCreate:
      isPersonal ||
      orgRole === "org:admin" ||
      orgRole === "org:editor" ||
      orgRole === "org:member",
    canApprove: orgRole === "org:admin",
    canManageSocials:
      isPersonal || orgRole === "org:admin" || orgRole === "org:editor",
    canManageMembers: isPersonal || orgRole === "org:admin",
    requiresApproval:
      !isPersonal && (orgRole === "org:editor" || orgRole === "org:member"),
    isViewer: orgRole === "org:viewer",
    isPersonal,
  };
}
