import { type ReactNode, useSyncExternalStore } from "react";

interface AuthFixtureConfig {
  signedOut?: boolean;
  holdOrgSwitch?: boolean;
}
const authConfig = () =>
  (window as { fixtureConfig?: AuthFixtureConfig }).fixtureConfig ?? {};
const signedOut = () => Boolean(authConfig().signedOut);

// Clerk's active organization, switched by `setActive` like the real SDK.
let activeOrgId: string | null = null;
const orgListeners = new Set<() => void>();
const subscribeOrg = (listener: () => void) => {
  orgListeners.add(listener);
  return () => orgListeners.delete(listener);
};
const setActive = async ({
  organization,
}: {
  organization?: string | null;
}) => {
  if (authConfig().holdOrgSwitch) {
    return;
  }
  activeOrgId = organization ?? null;
  for (const listener of orgListeners) {
    listener();
  }
};
export const useClerk = () => ({ setActive });
const getToken = async () => (signedOut() ? null : "fixture-token");
export const useAuth = () => ({
  orgId: useSyncExternalStore(subscribeOrg, () => activeOrgId),
  getToken,
  isLoaded: true,
  isSignedIn: !signedOut(),
  userId: signedOut() ? null : "fixture-user",
  sessionId: signedOut() ? null : "fixture-session",
});
export const useUser = () => ({
  user: {
    id: "fixture-user",
    primaryEmailAddress: { emailAddress: "test@example.com" },
    publicMetadata: { onboardingComplete: true, referralPromptDismissed: true },
  },
});
export const useOrganization = () => ({ membership: null });
export const AuthProvider = ({ children }: { children: ReactNode }) => children;
export const UserButton = Object.assign(
  () => (
    <button aria-label="Account" type="button">
      TU
    </button>
  ),
  {
    MenuItems: () => null,
    Action: () => null,
    Link: () => null,
    UserProfilePage: () => null,
  }
);
/** Renders custom pages inline so Delulu's sections can be exercised. */
export const OrganizationProfile = Object.assign(
  ({ children }: { children?: ReactNode }) => (
    <div data-testid="clerk-organization-profile">{children}</div>
  ),
  {
    Page: ({ label, children }: { label: string; children?: ReactNode }) => (
      <section aria-label={label}>{children}</section>
    ),
  }
);
