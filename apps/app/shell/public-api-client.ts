import { createApiClient } from "@delulu/client";
import { resolveAuthenticatedToken } from "./authenticated-token";

export function resolveApiBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_API_URL ??
    (process.env.NODE_ENV === "development"
      ? "http://localhost:8788"
      : "https://api.delulu.social")
  );
}

export function createPublicApiClient(getToken: () => Promise<string | null>) {
  return createApiClient({
    baseUrl: resolveApiBaseUrl(),
    getToken: () => resolveAuthenticatedToken(getToken),
  });
}
