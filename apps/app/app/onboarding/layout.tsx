import { auth } from "@delulu/auth/server";
import { redirect } from "next/navigation";
import { BackendProviders } from "@/shell/providers/backend";

export const dynamic = "force-dynamic";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { sessionClaims } = await auth();

  // If user has already completed onboarding, redirect to home
  const metadata = sessionClaims?.metadata as
    | { onboardingComplete?: boolean }
    | undefined;
  if (metadata?.onboardingComplete === true) {
    redirect("/");
  }

  return <BackendProviders surface="onboarding">{children}</BackendProviders>;
}
