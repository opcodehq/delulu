import type { ReactNode } from "react";

const signedOut = () =>
  Boolean(
    (window as { fixtureConfig?: { signedOut?: boolean } }).fixtureConfig
      ?.signedOut
  );
const getToken = async () => (signedOut() ? null : "fixture-token");
export const useAuth = () => ({
  getToken,
  isLoaded: true,
  isSignedIn: !signedOut(),
  userId: signedOut() ? null : "fixture-user",
  sessionId: signedOut() ? null : "fixture-session",
  orgId: null,
});
const setActive = async () => undefined;
export const useClerk = () => ({ setActive });
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
