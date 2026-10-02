import { secure } from "@delulu/security";
import { env } from "env";
import type { ReactNode } from "react";
import { AppShell } from "@/shell/app-shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  if (env.ARCJET_KEY) {
    await secure(["CATEGORY:PREVIEW"]);
  }
  return <AppShell>{children}</AppShell>;
}
