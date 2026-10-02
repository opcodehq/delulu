import type { ReactNode } from "react";

const getToken = async () => "fixture-token";
export const useAuth = () => ({
  getToken,
  isLoaded: true,
  isSignedIn: true,
  userId: "fixture-user",
  sessionId: "fixture-session",
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
  { MenuItems: () => null, Action: () => null, Link: () => null }
);
