import { auth } from "@delulu/auth/server";
import { Logo } from "@delulu/design-system/components/logo";
import { Button } from "@delulu/design-system/components/ui/button";
import Link from "next/link";

import { AuthorizationShell } from "@/shell/navigation/authorization-shell";

export const dynamic = "force-dynamic";

export default async function ConnectionResultPage() {
  const { sessionClaims } = await auth();
  const metadata = sessionClaims?.metadata as
    | { onboardingComplete?: boolean }
    | undefined;
  const destination =
    metadata?.onboardingComplete === true ? "/socials" : "/onboarding";

  return (
    <AuthorizationShell>
      <section className="space-y-4">
        <Logo />
        <div className="space-y-2">
          <h1 className="font-semibold text-lg tracking-tight">
            This connection attempt expired
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            For your security, connection links only work for a short time.
            Nothing was changed. Start again from the app.
          </p>
        </div>
        <Button asChild className="w-full">
          <Link href={destination}>Return to connections</Link>
        </Button>
      </section>
    </AuthorizationShell>
  );
}
