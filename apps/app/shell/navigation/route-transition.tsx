"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
} from "react";
import { PageLoading } from "@/shell/loading";

const NavigationContext = createContext<{
  pendingHref: string | null;
  push: ReturnType<typeof useRouter>["push"];
  replace: ReturnType<typeof useRouter>["replace"];
} | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [href, setHref] = useState<string | null>(null);
  const push = useCallback(
    (url: string, options?: { scroll?: boolean }) => {
      setHref(url);
      startTransition(() => router.push(url, options));
    },
    [router]
  );
  const replace = useCallback(
    (url: string, options?: { scroll?: boolean }) => {
      setHref(url);
      startTransition(() => router.replace(url, options));
    },
    [router]
  );
  const value = useMemo(
    () => ({ pendingHref: isPending ? href : null, push, replace }),
    [href, isPending, push, replace]
  );
  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useAppRouter() {
  const router = useRouter();
  const navigation = useContext(NavigationContext);
  const push = navigation?.push ?? router.push;
  const replace = navigation?.replace ?? router.replace;
  return useMemo(() => ({ ...router, push, replace }), [router, push, replace]);
}

export function usePendingHref() {
  return useContext(NavigationContext)?.pendingHref ?? null;
}

export function RouteContent({ children }: { children: ReactNode }) {
  const pending = usePendingHref();
  return (
    <>
      {pending && <PageLoading label="Loading page" />}
      <div
        className={pending ? "hidden" : "flex min-h-0 flex-1 flex-col"}
        hidden={Boolean(pending)}
      >
        {children}
      </div>
    </>
  );
}
