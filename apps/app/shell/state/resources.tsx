"use client";

import type {
  MutationEffect,
  ResourceEffect,
  ResourceKey,
} from "@delulu/client";
import { type ApiClient, ApiClientService } from "@delulu/client";
import { Button } from "@delulu/design-system/components/ui/button";
import {
  RegistryContext,
  scheduleTask,
  useAtomSet,
  useAtomSuspense,
  useAtomValue,
} from "@effect/atom-react";
import { BrowserKeyValueStore } from "@effect/platform-browser";
import { captureException } from "@sentry/nextjs";
import { Cause, Effect, Layer, Option, Schedule } from "effect";
import { AsyncResult, Atom, AtomRegistry } from "effect/unstable/reactivity";
import {
  Component,
  createContext,
  type ReactNode,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

interface ResourcePolicy {
  readonly staleTime: number;
  readonly retry: number;
  readonly retryDelayMs: number;
}

interface ResourceEntry<A = unknown, E = unknown> {
  readonly descriptor: { current: ResourceEffect<A, E> };
  readonly retryPolicy: { retry: number; retryDelayMs: number };
  readonly atom: Atom.Writable<AsyncResult.AsyncResult<A, E>>;
  readonly optimistic: { current: boolean };
  readonly policies: Map<string, Atom.Atom<AsyncResult.AsyncResult<A, E>>>;
}

const keyId = (key: ResourceKey): string => JSON.stringify(key);

const keyPartEqual = (left: unknown, right: unknown): boolean =>
  Object.is(left, right) || JSON.stringify(left) === JSON.stringify(right);

const keyStartsWith = (key: ResourceKey, prefix: ResourceKey): boolean =>
  prefix.length <= key.length &&
  prefix.every((part, index) => keyPartEqual(part, key[index]));

const windowFocusSignal =
  typeof window === "undefined" ? undefined : Atom.windowFocusSignal;

class ResourceStore {
  readonly runtime;
  readonly resources = new Map<string, ResourceEntry>();
  readonly refreshTargets = new WeakMap<
    Atom.Atom<unknown>,
    Atom.Atom<unknown>
  >();

  constructor(client?: ApiClient) {
    const layer = client
      ? Layer.merge(
          ApiClientService.layer(client),
          BrowserKeyValueStore.layerLocalStorage
        )
      : Layer.empty;
    this.runtime = Atom.runtime(layer);
  }

  query<A, E>(
    descriptor: ResourceEffect<A, E>,
    policy: ResourcePolicy
  ): Atom.Atom<AsyncResult.AsyncResult<A, E>> {
    const id = keyId(descriptor.queryKey);
    let entry = this.resources.get(id) as ResourceEntry<A, E> | undefined;
    if (entry) {
      entry.descriptor.current = descriptor;
      entry.retryPolicy.retry = Math.max(entry.retryPolicy.retry, policy.retry);
      entry.retryPolicy.retryDelayMs = Math.max(
        entry.retryPolicy.retryDelayMs,
        policy.retryDelayMs
      );
    } else {
      const descriptorRef = { current: descriptor };
      const retryPolicy = {
        retry: policy.retry,
        retryDelayMs: policy.retryDelayMs,
      };
      const source = this.runtime.atom(() =>
        Effect.suspend(() =>
          descriptorRef.current.effect().pipe(
            Effect.retry({
              times: retryPolicy.retry,
              schedule: Schedule.exponential(retryPolicy.retryDelayMs),
            })
          )
        )
      );
      const optimistic = { current: false };
      const atom = Atom.writable(
        (get) => {
          const latest = get(source);
          const current = Option.getOrUndefined(
            get.self<AsyncResult.AsyncResult<A, E>>()
          );
          if (current && Option.isSome(AsyncResult.value(current))) {
            if (optimistic.current) {
              return current;
            }
            if (latest.waiting) {
              return AsyncResult.waiting(current);
            }
            if (AsyncResult.isFailure(latest)) {
              return AsyncResult.failureWithPrevious(latest.cause, {
                previous: Option.some(current),
              });
            }
          }
          return latest;
        },
        (context, value: AsyncResult.AsyncResult<A, E>) =>
          context.setSelf(value),
        (refresh) => {
          optimistic.current = false;
          refresh(source);
        }
      ).pipe(Atom.setIdleTTL("5 minutes"));
      entry = {
        descriptor: descriptorRef,
        retryPolicy,
        atom,
        optimistic,
        policies: new Map(),
      };
      this.resources.set(id, entry as ResourceEntry);
    }

    const policyId = String(policy.staleTime);
    let policyAtom = entry.policies.get(policyId);
    if (!policyAtom) {
      policyAtom = entry.atom.pipe(
        Atom.swr({
          staleTime: policy.staleTime,
          revalidateOnMount: true,
          revalidateOnFocus: windowFocusSignal !== undefined,
          focusSignal: windowFocusSignal,
        }),
        Atom.setIdleTTL("5 minutes")
      );
      entry.policies.set(policyId, policyAtom);
      this.refreshTargets.set(policyAtom, entry.atom);
    }
    return policyAtom;
  }

  refreshTarget<A, E>(
    atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>
  ): Atom.Atom<AsyncResult.AsyncResult<A, E>> {
    return (this.refreshTargets.get(atom) ?? atom) as Atom.Atom<
      AsyncResult.AsyncResult<A, E>
    >;
  }

  entries(prefix: ResourceKey): ResourceEntry[] {
    const matches: ResourceEntry[] = [];
    for (const entry of this.resources.values()) {
      if (keyStartsWith(entry.descriptor.current.queryKey, prefix)) {
        matches.push(entry);
      }
    }
    return matches;
  }

  exact(key: ResourceKey): ResourceEntry[] {
    return this.entries(key).filter(
      (entry) => entry.descriptor.current.queryKey.length === key.length
    );
  }

  remove(atom: Atom.Atom<unknown>): void {
    for (const [id, entry] of this.resources) {
      if (entry.atom === atom) {
        this.resources.delete(id);
      }
    }
  }
}

const ResourceStoreContext = createContext<ResourceStore | null>(null);
const BoundaryAtomsContext = createContext<Set<Atom.Atom<unknown>> | null>(
  null
);
const ClientReadyContext = createContext(false);

export const appRegistry = AtomRegistry.make({
  scheduleTask,
  defaultIdleTTL: 400,
});

const useResourceStore = (): ResourceStore => {
  const store = useContext(ResourceStoreContext);
  if (!store) {
    throw new Error("Resource hooks must be used within AppStateProvider");
  }
  return store;
};

export function AppStateProvider({
  children,
  client,
}: {
  readonly children: ReactNode;
  readonly client?: ApiClient;
}) {
  const storeRef = useRef<ResourceStore | null>(null);
  const [clientReady, setClientReady] = useState(false);
  if (!storeRef.current) {
    storeRef.current = new ResourceStore(client);
  }
  useEffect(() => {
    setClientReady(true);
    const previousOnNodeRemoved = appRegistry.onNodeRemoved;
    appRegistry.onNodeRemoved = (node) => {
      previousOnNodeRemoved?.(node);
      storeRef.current?.remove(node.atom);
    };
    const refreshOnReconnect = () => {
      for (const entry of storeRef.current?.resources.values() ?? []) {
        appRegistry.refresh(entry.atom);
      }
    };
    window.addEventListener("online", refreshOnReconnect);
    return () => {
      window.removeEventListener("online", refreshOnReconnect);
      appRegistry.onNodeRemoved = previousOnNodeRemoved;
    };
  }, []);
  return (
    <RegistryContext.Provider value={appRegistry}>
      <ResourceStoreContext.Provider value={storeRef.current}>
        <ClientReadyContext.Provider value={clientReady}>
          {children}
        </ClientReadyContext.Provider>
      </ResourceStoreContext.Provider>
    </RegistryContext.Provider>
  );
}

class ResourceErrorBoundary extends Component<
  {
    readonly children: ReactNode;
    readonly renderError: (error: unknown, retry: () => void) => ReactNode;
    readonly retry: () => void;
  },
  { readonly error: unknown | null }
> {
  state: { readonly error: unknown | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown) {
    captureException(error);
  }

  private readonly retry = () => {
    this.props.retry();
    this.setState({ error: null });
  };

  render() {
    return this.state.error
      ? this.props.renderError(this.state.error, this.retry)
      : this.props.children;
  }
}

export function ResourceBoundary({
  children,
  fallback = null,
  renderError = (error, retry) => (
    <div
      className="m-6 flex flex-col items-center gap-3 rounded-lg border border-border px-6 py-10 text-center"
      role="alert"
    >
      <div>
        <p className="font-medium">Unable to load data</p>
        <p className="mt-1 max-w-md text-muted-foreground text-sm">
          {error instanceof Error && error.message
            ? error.message
            : "An unexpected error occurred while loading this page."}
        </p>
      </div>
      <Button onClick={retry} variant="ghost">
        Retry
      </Button>
    </div>
  ),
}: {
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
  readonly renderError?: (error: unknown, retry: () => void) => ReactNode;
}) {
  const store = useResourceStore();
  const registry = useContext(RegistryContext);
  const atoms = useRef(new Set<Atom.Atom<unknown>>());
  // Failed children are unmounted. Keep their reads across parent renders so
  // Retry can still refresh them; page boundaries reset on route/workspace changes.
  const retry = useCallback(() => {
    for (const atom of atoms.current) {
      registry.refresh(atom);
    }
  }, [registry]);
  return (
    <ResourceErrorBoundary renderError={renderError} retry={retry}>
      <BoundaryAtomsContext.Provider value={atoms.current}>
        <Suspense fallback={fallback}>{children}</Suspense>
      </BoundaryAtomsContext.Provider>
    </ResourceErrorBoundary>
  );
}

export interface ResourceAtomOptions<A, E> extends ResourceEffect<A, E> {
  readonly enabled?: boolean;
  /** Non-suspending reads allow independent resources to start in parallel. */
  readonly suspense?: boolean;
  readonly throwOnError?: boolean;
  readonly staleTime?: number;
  readonly retry?: number;
  readonly retryDelayMs?: number;
  /** Poll only while mounted and visible; never overlap an existing read. */
  readonly refetchInterval?: number | false;
}

export interface ResourceAtomResult<A> {
  readonly data: A | undefined;
  readonly error: Error | null;
  readonly isError: boolean;
  readonly isFetching: boolean;
  readonly isLoading: boolean;
  readonly isPending: boolean;
  readonly refetch: () => Promise<{ readonly data: A | undefined }>;
}

const disabledAtom = Atom.make(
  AsyncResult.success<undefined, never>(undefined)
).pipe(Atom.keepAlive);

export function useResourceAtom<A, E>(
  options: ResourceAtomOptions<A, E>
): ResourceAtomResult<A> {
  const store = useResourceStore();
  const registry = useContext(RegistryContext);
  const boundaryAtoms = useContext(BoundaryAtomsContext);
  const clientReady = useContext(ClientReadyContext);
  const enabled = clientReady && (options.enabled ?? true);
  const atom = (
    enabled
      ? store.query(options, {
          staleTime: options.staleTime ?? 30_000,
          retry: options.retry ?? 3,
          retryDelayMs: options.retryDelayMs ?? 0,
        })
      : disabledAtom
  ) as Atom.Atom<AsyncResult.AsyncResult<A | undefined, E>>;
  boundaryAtoms?.add(atom);
  const raw = useAtomValue(options.suspense === false ? atom : disabledAtom);
  const suspended = useAtomSuspense(
    options.suspense === false ? disabledAtom : atom,
    { includeFailure: true }
  );
  const result = options.suspense === false ? raw : suspended;
  // Preserve the existing boundary/retry contract for failures in both modes.
  const failure = AsyncResult.isFailure(result)
    ? Cause.squash(result.cause)
    : null;
  const error =
    failure === null || result.waiting
      ? null
      : failure instanceof Error
        ? failure
        : new Error(String(failure));
  const accessDenied =
    failure !== null &&
    typeof failure === "object" &&
    "_tag" in failure &&
    (failure._tag === "UnauthorizedError" || failure._tag === "ForbiddenError");
  const data = accessDenied
    ? undefined
    : Option.getOrUndefined(AsyncResult.value(result));
  if (
    error &&
    options.throwOnError !== false &&
    (data === undefined || accessDenied)
  ) {
    throw error;
  }
  const refreshTarget = store.refreshTarget(atom);
  const staleTime = options.staleTime ?? 30_000;
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const current = registry.get(refreshTarget);
    const previous = AsyncResult.isSuccess(current)
      ? current
      : AsyncResult.isFailure(current)
        ? Option.getOrUndefined(current.previousSuccess)
        : undefined;
    // Policy atoms are retained for fast returns. Their SWR constructor does
    // not run again on React remount, so check freshness at this lifecycle too.
    if (
      !current.waiting &&
      previous &&
      Date.now() - previous.timestamp >= staleTime
    ) {
      registry.refresh(refreshTarget);
    }
  }, [enabled, refreshTarget, registry, staleTime]);
  const refresh = useCallback(async () => {
    registry.refresh(refreshTarget);
    const settled = await Effect.runPromise(
      AtomRegistry.getResult(registry, refreshTarget, {
        suspendOnWaiting: true,
      })
    );
    return { data: settled };
  }, [refreshTarget, registry]);
  useEffect(() => {
    const interval = options.refetchInterval;
    if (!(enabled && interval) || interval <= 0) {
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!(document.hidden || registry.get(refreshTarget).waiting)) {
        await refresh().catch(() => undefined);
      }
      if (!stopped) {
        timer = setTimeout(poll, interval);
      }
    };
    timer = setTimeout(poll, interval);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [enabled, options.refetchInterval, refresh, refreshTarget, registry]);
  return {
    data: data as A | undefined,
    error,
    isError: error !== null,
    isFetching: enabled && result.waiting,
    isLoading:
      (options.enabled ?? true) &&
      (!clientReady ||
        AsyncResult.isInitial(result) ||
        (result.waiting && data === undefined)),
    isPending:
      (options.enabled ?? true) &&
      (!clientReady ||
        AsyncResult.isInitial(result) ||
        (result.waiting && data === undefined)),
    refetch: refresh,
  };
}

interface MutationCallbacks<A, Variables, Context> {
  readonly onMutate?: (variables: Variables) => Context | Promise<Context>;
  readonly onSuccess?: (
    data: A,
    variables: Variables,
    context: Context | undefined
  ) => unknown;
  readonly onError?: (
    error: unknown,
    variables: Variables,
    context: Context | undefined
  ) => unknown;
  readonly onSettled?: (
    data: A | undefined,
    error: unknown,
    variables: Variables,
    context: Context | undefined
  ) => unknown;
}

export type MutationAtomOptions<
  A,
  E,
  Variables,
  Context = unknown,
> = MutationEffect<A, E, Variables> & MutationCallbacks<A, Variables, Context>;

export interface MutationAtomResult<A, Variables> {
  readonly data: A | undefined;
  readonly error: unknown;
  readonly isError: boolean;
  readonly isPending: boolean;
  readonly mutate: (variables: Variables) => void;
  readonly mutateAsync: (variables: Variables) => Promise<A>;
  readonly reset: () => void;
}

export function useMutationAtom<A, E, Variables, Context = unknown>(
  options: MutationAtomOptions<A, E, Variables, Context>
): MutationAtomResult<A, Variables> {
  const store = useResourceStore();
  const descriptor = useRef(options);
  descriptor.current = options;
  interface Invocation {
    variables: Variables;
    mutation: MutationEffect<A, E, Variables>;
  }
  const mutationAtom = useRef<Atom.AtomResultFn<Invocation, A, E> | null>(null);
  const inFlight = useRef(new Map<string, Promise<A>>());
  if (!mutationAtom.current) {
    mutationAtom.current = store.runtime.fn(
      ({ variables, mutation }: Invocation) =>
        Effect.suspend(() => mutation.effect(variables)),
      { concurrent: true }
    );
  }
  const result = useAtomValue(mutationAtom.current);
  const set = useAtomSet(mutationAtom.current, { mode: "promise" });
  const resetAtom = useAtomSet(mutationAtom.current);
  const registry = useContext(RegistryContext);

  const mutateAsync = useCallback(
    (variables: Variables): Promise<A> => {
      const operationOptions = descriptor.current;
      const operationId = keyId([operationOptions.mutationKey, variables]);
      const currentOperation = inFlight.current.get(operationId);
      if (currentOperation) {
        return currentOperation;
      }
      const operation = (async () => {
        const context = await operationOptions.onMutate?.(variables);
        try {
          const data = await set({ variables, mutation: operationOptions });
          const mutationKey = operationOptions.mutationKey;
          const resourceRoot =
            mutationKey?.[0] === "workspace" && mutationKey.length >= 3
              ? mutationKey.slice(0, 3)
              : mutationKey;
          const invalidations = [
            ...(operationOptions.invalidates ?? []),
            ...(mutationKey ? [mutationKey] : []),
            ...(resourceRoot ? [resourceRoot] : []),
          ];
          const uniqueInvalidations = new Map(
            invalidations.map((key) => [keyId(key), key])
          );
          const affected = new Set(
            [...uniqueInvalidations.values()].flatMap((key) =>
              store.entries(key)
            )
          );
          for (const entry of affected) {
            entry.optimistic.current = false;
            registry.refresh(entry.atom);
          }
          await operationOptions.onSuccess?.(data, variables, context);
          await operationOptions.onSettled?.(
            data,
            undefined,
            variables,
            context
          );
          return data;
        } catch (error) {
          await operationOptions.onError?.(error, variables, context);
          await operationOptions.onSettled?.(
            undefined,
            error,
            variables,
            context
          );
          throw error;
        }
      })();
      inFlight.current.set(operationId, operation);
      operation
        .finally(() => {
          if (inFlight.current.get(operationId) === operation) {
            inFlight.current.delete(operationId);
          }
        })
        .catch(() => undefined);
      return operation;
    },
    [registry, set, store]
  );

  const error = AsyncResult.isFailure(result)
    ? Cause.squash(result.cause)
    : undefined;
  return {
    data: AsyncResult.isSuccess(result) ? result.value : undefined,
    error,
    isError: AsyncResult.isFailure(result),
    isPending: result.waiting,
    mutate: (variables) => {
      mutateAsync(variables).catch(() => undefined);
    },
    mutateAsync,
    reset: () => resetAtom(Atom.Reset),
  };
}

export interface ResourceRegistry {
  readonly beginOptimisticUpdate: (options: {
    readonly queryKey: ResourceKey;
  }) => Promise<void>;
  readonly fetchResource: <A, E>(
    options: ResourceEffect<A, E> & { readonly staleTime?: number }
  ) => Promise<A>;
  readonly seedResource: <A, E>(
    resource: ResourceEffect<A, E>,
    update: A | ((current: A | undefined) => A),
    options?: { readonly revalidate?: boolean }
  ) => void;
  readonly getResource: <A>(queryKey: ResourceKey) => A | undefined;
  readonly invalidateResources: (options: {
    readonly queryKey: ResourceKey;
  }) => Promise<void>;
  readonly setResource: <A>(
    queryKey: ResourceKey,
    update: A | ((current: A | undefined) => A | undefined)
  ) => void;
}

export function useResourceRegistry(): ResourceRegistry {
  const store = useResourceStore();
  const registry = useContext(RegistryContext);
  return useMemo(
    () => ({
      beginOptimisticUpdate: async ({
        queryKey,
      }: {
        queryKey: ResourceKey;
      }) => {
        for (const entry of store.entries(queryKey)) {
          entry.optimistic.current = true;
        }
      },
      fetchResource: async <A, E>(
        options: ResourceEffect<A, E> & { readonly staleTime?: number }
      ) => {
        const atom = store.refreshTarget(
          store.query(options, {
            staleTime: Number.POSITIVE_INFINITY,
            retry: 0,
            retryDelayMs: 0,
          })
        );
        // Use the same source as mounted readers: join an in-flight request,
        // otherwise refresh it. Direct effects can race and overwrite the UI.
        const current = registry.get(atom);
        if (
          AsyncResult.isSuccess(current) &&
          options.staleTime !== undefined &&
          Date.now() - current.timestamp < options.staleTime
        ) {
          return current.value;
        }
        if (!(current.waiting || AsyncResult.isInitial(current))) {
          registry.refresh(atom);
        }
        return Effect.runPromise(
          AtomRegistry.getResult(registry, atom, {
            suspendOnWaiting: true,
          })
        );
      },
      seedResource: <A, E>(
        resource: ResourceEffect<A, E>,
        update: A | ((current: A | undefined) => A),
        options?: { readonly revalidate?: boolean }
      ) => {
        store.query(resource, { staleTime: 30_000, retry: 0, retryDelayMs: 0 });
        for (const entry of store.exact(resource.queryKey)) {
          const current = Option.getOrUndefined(
            AsyncResult.value(registry.get(entry.atom))
          ) as A | undefined;
          const next =
            typeof update === "function"
              ? (update as (current: A | undefined) => A)(current)
              : update;
          // Hold the confirmed mutation result against older in-flight reads.
          // The next refresh releases it and keeps it visible while waiting.
          entry.optimistic.current = true;
          registry.set(
            entry.atom,
            AsyncResult.success(
              next,
              options?.revalidate ? { timestamp: 0 } : undefined
            )
          );
          if (options?.revalidate) {
            registry.refresh(entry.atom);
            registry.get(entry.atom);
          }
        }
      },
      getResource: <A,>(queryKey: ResourceKey): A | undefined => {
        const entry = store.exact(queryKey)[0];
        if (!entry) {
          return undefined;
        }
        const value = registry.get(entry.atom);
        return Option.getOrUndefined(AsyncResult.value(value)) as A | undefined;
      },
      invalidateResources: async ({ queryKey }: { queryKey: ResourceKey }) => {
        for (const entry of store.entries(queryKey)) {
          entry.optimistic.current = false;
          registry.refresh(entry.atom);
        }
      },
      setResource: <A,>(
        queryKey: ResourceKey,
        update: A | ((current: A | undefined) => A | undefined)
      ) => {
        const entries = store.exact(queryKey);
        if (entries.length === 0) {
          return;
        }
        for (const entry of entries) {
          const current = Option.getOrUndefined(
            AsyncResult.value(registry.get(entry.atom))
          ) as A | undefined;
          const next =
            typeof update === "function"
              ? (update as (current: A | undefined) => A | undefined)(current)
              : update;
          if (next !== undefined) {
            registry.set(entry.atom, AsyncResult.success(next));
          }
        }
      },
    }),
    [registry, store]
  );
}
