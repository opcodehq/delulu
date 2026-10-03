import type { Metadata } from "next";
import { OrganizationSettings } from "@/features/organization/organization-settings";

export const metadata: Metadata = { title: "Organization settings · Delulu" };

export default function OrganizationPage() {
  return <OrganizationSettings />;
}
