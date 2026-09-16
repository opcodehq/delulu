"use client";

import { useAuth } from "@delulu/auth";
import {
  type ApiClient,
  createApiClient,
  createResourceEffects,
} from "@delulu/client";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { resolveApiBaseUrl } from "../../lib/public-api-client";

type ResourceEffects = ReturnType<typeof createResourceEffects>;

interface ApiClientContextValue {
  readonly client: ApiClient;
  readonly resources: ResourceEffects;
}

const ApiClientContext = createContext<ApiClientContextValue | null>(null);

const apiBaseUrl = resolveApiBaseUrl();

export const resolveAuthenticatedToken = async (
  getToken: () => Promise<string | null>,
  options: { attempts?: number; delayMs?: number } = {}
): Promise<string> => {
  const attempts = options.attempts ?? 6;
  const delayMs = options.delayMs ?? 75;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const token = await getToken();
    if (token) {
      return token;
    }
    if (attempt < attempts - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, delayMs * 2 ** attempt)
      );
    }
  }
  throw new Error("Your session is still loading. Please try again.");
};

export function ApiClientProvider({
  children,
  fallback = null,
}: {
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
}) {
  const { getToken, isLoaded, isSignedIn } = useAuth();

  const value = useMemo<ApiClientContextValue>(() => {
    if (!apiBaseUrl) {
      throw new Error("Missing NEXT_PUBLIC_API_URL");
    }

    const client = createApiClient({
      baseUrl: apiBaseUrl,
      getToken: () => resolveAuthenticatedToken(getToken),
    });

    return {
      client,
      resources: createResourceEffects({ client }),
    };
  }, [getToken]);

  if (!(isLoaded && isSignedIn)) {
    return fallback;
  }

  return (
    <ApiClientContext.Provider value={value}>
      {children}
    </ApiClientContext.Provider>
  );
}

export const useApiClient = (): ApiClientContextValue => {
  const value = useContext(ApiClientContext);
  if (!value) {
    throw new Error("useApiClient must be used within ApiClientProvider");
  }
  return value;
};
