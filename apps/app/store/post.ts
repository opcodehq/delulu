import { DEFAULT_TIKTOK_SETTINGS } from "@delulu/validators/constants/settings";
import type {
  FullPostType,
  ProviderSetting,
  SocialProviderType,
  TikTokSettings,
} from "@delulu/validators/post";
import { promotionContentTypes } from "@delulu/validators/post";
import { useAtomValue } from "@effect/atom-react";
import { Exit, Predicate, Schema } from "effect";
import { Atom } from "effect/unstable/reactivity";
import type { NodePositions } from "@/components/automations/flow-builder/hooks/use-automation-state";
import type {
  AutomationStep,
  Note,
  TriggerStep,
} from "@/components/automations/flow-builder/utils/flow-types";
import { type EditorMediaDetail, hydrateEditorMedia } from "@/lib/editor-media";
import { appRegistry } from "@/state/resources";

export interface InlineAutomationConfig {
  templateSlug: string;
  socialProviderId: string;
  name: string;
  triggers: TriggerStep[];
  steps: AutomationStep[];
  notes: Note[];
  nodePositions: NodePositions;
  isActive: boolean;
  /** Set when editing an existing automation — triggers update instead of create */
  existingAutomationId?: string;
}

// Define the store's state types
interface PostState {
  date: Date | undefined;
  time: string | null;
  post: FullPostType;
  selectedSocialProviders: SocialProviderType[];
  shouldReset: boolean;
  // TikTok specific settings - @deprecated use providerSettings
  tiktokSettings: TikTokSettings | null;
  // Provider-specific settings (socialProviderId -> settings)
  providerSettings: Record<string, ProviderSetting>;
  // Media upload state
  isMediaUploading: boolean;
  // Inline automation configs (keyed by socialProviderId)
  automationConfigs: Record<string, InlineAutomationConfig>;
}

// Define the store's actions
interface PostActions {
  setShouldReset: (shouldReset: boolean) => void;
  setDateAlongWithTime: (date: Date | undefined) => void;
  setTime: (time: string | null) => void;
  setPost: (
    post: FullPostType | ((currentPost: FullPostType) => FullPostType)
  ) => void;
  setSelectedSocialProviders: (providers: SocialProviderType[]) => void;
  setTikTokSettings: (settings: Partial<TikTokSettings>) => void; // @deprecated
  setProviderSettings: (providerId: string, setting: ProviderSetting) => void;
  getProviderSettings: (providerId: string) => ProviderSetting | undefined;
  setIsMediaUploading: (isUploading: boolean) => void;
  setAutomationConfig: (
    providerId: string,
    config: InlineAutomationConfig | null
  ) => void;
  loadPost: (
    postData: {
      id: string;
      workspaceId: string;
      groups: readonly {
        readonly id: string;
        readonly isDefault: boolean;
        readonly segments: readonly {
          readonly text: string;
          readonly media: readonly {
            readonly id: string;
            readonly altText?: string;
            readonly thumbnailMediaId?: string;
            readonly thumbnailTimestamp?: number;
          }[];
        }[];
      }[];
      targets: readonly {
        readonly connectionId: string;
        readonly groupId: string;
        readonly scheduledAt: string | null;
        readonly settings: {
          readonly platform: ProviderSetting["type"];
          readonly values: ProviderSetting["settings"];
        };
      }[];
    },
    mediaById: ReadonlyMap<string, EditorMediaDetail>,
    connections?: readonly {
      readonly id: string;
      readonly platform: string;
      readonly displayName: string | null;
      readonly username: string | null;
      readonly profileId: string;
    }[]
  ) => void;
  cleanupDeletedProviders: (validProviderIds: string[]) => void;
  reset: () => void;
}

const initialState: PostState = {
  date: undefined,
  time: "00:00",
  shouldReset: false,
  post: {
    id: "",
    content: [
      {
        title: "",
        text: "",
        media: [],
        name: "DEFAULT",
        order: 0,
        tags: [],
      },
    ],
    alternativeContent: [],
    scheduledTime: undefined,
    orgId: "",
  },
  selectedSocialProviders: [],
  // TikTok specific settings defaults - @deprecated
  tiktokSettings: null,
  // Provider-specific settings
  providerSettings: {},
  // Media upload state defaults
  isMediaUploading: false,
  // Inline automation configs
  automationConfigs: {},
};

const STORAGE_KEY = "post-storage";
type PersistedPostState = Omit<PostState, "isMediaUploading">;
const { isMediaUploading: initialUploadState, ...initialDraftState } =
  initialState;
const postStateAtom = Atom.make<PersistedPostState>(initialDraftState).pipe(
  Atom.keepAlive
);
const mediaUploadingAtom = Atom.make(initialUploadState).pipe(Atom.keepAlive);

const persistedEnvelope = Schema.fromJsonString(
  Schema.Union([
    Schema.Struct({ state: Schema.Unknown, version: Schema.Number }),
    Schema.Struct({ draft: Schema.Unknown, version: Schema.Literal(1) }),
  ])
);

const isPersistedDraft = (value: unknown): value is Partial<PostState> =>
  Predicate.isObject(value) &&
  (value.time === undefined ||
    value.time === null ||
    Predicate.isString(value.time)) &&
  (value.selectedSocialProviders === undefined ||
    Array.isArray(value.selectedSocialProviders)) &&
  (value.providerSettings === undefined ||
    Predicate.isObject(value.providerSettings)) &&
  (value.automationConfigs === undefined ||
    Predicate.isObject(value.automationConfigs)) &&
  (value.post === undefined ||
    (Predicate.isObject(value.post) &&
      Array.isArray(value.post.content) &&
      Array.isArray(value.post.alternativeContent)));

const restoreDate = (value: unknown): Date | undefined => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }
  if (!Predicate.isString(value)) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const persistState = (state: PostState): void => {
  if (typeof localStorage === "undefined") {
    return;
  }
  const { isMediaUploading: _, ...draft } = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, draft }));
};

const getState = (): PostState => ({
  ...appRegistry.get(postStateAtom),
  isMediaUploading: appRegistry.get(mediaUploadingAtom),
});

const setState = (
  update:
    | Partial<PostState>
    | ((state: PostState) => Partial<PostState> | PostState)
): void => {
  const current = getState();
  const patch = typeof update === "function" ? update(current) : update;
  const next = { ...current, ...patch };
  const { isMediaUploading, ...draft } = next;
  Atom.batch(() => {
    appRegistry.set(postStateAtom, draft);
    appRegistry.set(mediaUploadingAtom, isMediaUploading);
  });
  persistState(next);
};

const actions: PostActions = {
  setShouldReset: (shouldReset) => setState({ shouldReset }),
  setDateAlongWithTime: (date) => setState({ date }),
  setTime: (time) => setState({ time }),
  setPost: (post) =>
    setState((state) => ({
      post: typeof post === "function" ? post(state.post) : post,
    })),
  setSelectedSocialProviders: (selectedSocialProviders) =>
    setState({ selectedSocialProviders }),
  setTikTokSettings: (settings) =>
    setState((state) => {
      const newSettings = {
        ...(state.tiktokSettings ?? DEFAULT_TIKTOK_SETTINGS),
        ...settings,
      };
      if (
        (newSettings.promotionContent === promotionContentTypes.PAID ||
          newSettings.promotionContent === promotionContentTypes.BOTH) &&
        newSettings.privacy === "SELF_ONLY"
      ) {
        newSettings.privacy = DEFAULT_TIKTOK_SETTINGS.privacy;
      }
      return { tiktokSettings: newSettings };
    }),
  setProviderSettings: (providerId, setting) =>
    setState((state) => ({
      providerSettings: { ...state.providerSettings, [providerId]: setting },
    })),
  getProviderSettings: (providerId) => getState().providerSettings[providerId],
  setIsMediaUploading: (isMediaUploading) => setState({ isMediaUploading }),
  setAutomationConfig: (providerId, config) =>
    setState((state) => {
      if (config === null) {
        const { [providerId]: _, ...automationConfigs } =
          state.automationConfigs;
        return { automationConfigs };
      }
      return {
        automationConfigs: {
          ...state.automationConfigs,
          [providerId]: config,
        },
      };
    }),
  loadPost: (postData, mediaById, connections = []) => {
    const defaultGroup =
      postData.groups.find((group) => group.isDefault) ?? postData.groups[0];
    const groupById = new Map(
      postData.groups.map((group) => [group.id, group])
    );
    const hydrateGroup = (
      group: (typeof postData.groups)[number] | undefined,
      name: string,
      socialId?: string
    ) =>
      (group?.segments ?? []).map((segment, order) => ({
        title: "",
        text: segment.text,
        media: hydrateEditorMedia(segment.media, mediaById),
        name: order === 0 ? name : `PART_${order + 1}`,
        order,
        tags: [],
        socialId,
      }));
    const scheduledAt =
      postData.targets.find((target) => target.scheduledAt)?.scheduledAt ??
      null;
    const scheduledDate = scheduledAt ? new Date(scheduledAt) : undefined;
    const providerSettings: Record<string, ProviderSetting> = {};
    const connectionById = new Map(
      connections.map((connection) => [connection.id, connection])
    );
    const socialProviderFor = (target: (typeof postData.targets)[number]) => {
      const connection = connectionById.get(target.connectionId);
      return {
        socialId: target.connectionId,
        name:
          connection?.displayName ??
          connection?.username ??
          connection?.profileId ??
          target.connectionId,
        socialType: target.settings.platform,
      };
    };
    for (const target of postData.targets) {
      providerSettings[target.connectionId] = {
        socialProviderId: target.connectionId,
        type: target.settings.platform,
        settings: target.settings.values,
      } as ProviderSetting;
    }
    const selectedSocialProviders = postData.targets.map(socialProviderFor);
    const alternativeContent = postData.targets.flatMap((target) => {
      const group = groupById.get(target.groupId);
      if (!group || group.id === defaultGroup?.id) {
        return [];
      }
      const socialProvider = socialProviderFor(target);
      return [
        {
          socialProvider,
          content: hydrateGroup(
            group,
            socialProvider.name,
            target.connectionId
          ),
        },
      ];
    });
    setState({
      post: {
        id: postData.id,
        content: hydrateGroup(defaultGroup, "DEFAULT"),
        alternativeContent,
        scheduledTime: scheduledDate,
        orgId: postData.workspaceId,
      },
      selectedSocialProviders,
      date: scheduledDate,
      time: scheduledDate
        ? `${scheduledDate.getHours().toString().padStart(2, "0")}:${scheduledDate.getMinutes().toString().padStart(2, "0")}`
        : "00:00",
      providerSettings,
    });
  },
  cleanupDeletedProviders: (validProviderIds) => {
    const validIds = new Set(validProviderIds);
    setState((state) => ({
      selectedSocialProviders: state.selectedSocialProviders.filter(
        (provider) => validIds.has(provider.socialId)
      ),
      post: {
        ...state.post,
        alternativeContent: state.post.alternativeContent.filter((content) =>
          validIds.has(content.socialProvider.socialId)
        ),
      },
      providerSettings: Object.fromEntries(
        Object.entries(state.providerSettings).filter(([providerId]) =>
          validIds.has(providerId)
        )
      ),
    }));
  },
  reset: () => setState(initialState),
};

export interface PostEditorCommands {
  readonly applyDraftHandoff: (draft: string) => void;
}

export const postEditorCommands: PostEditorCommands = {
  applyDraftHandoff: (draft) =>
    setState({
      ...initialState,
      post: {
        ...initialState.post,
        content: initialState.post.content.map((item, index) =>
          index === 0 ? { ...item, text: draft } : item
        ),
      },
    }),
};

type StoreValue = PostState & PostActions;
interface StoreHook {
  <T = StoreValue>(selector?: (state: StoreValue) => T): T;
  getState: () => StoreValue;
  setState: typeof setState;
  persist: { rehydrate: () => Promise<void> };
}

export const useStore: StoreHook = (<T>(
  selector: (state: StoreValue) => T = (state) => state as T
): T => {
  const draft = useAtomValue(postStateAtom);
  const isMediaUploading = useAtomValue(mediaUploadingAtom);
  return selector({ ...draft, isMediaUploading, ...actions });
}) as StoreHook;

useStore.getState = () => ({ ...getState(), ...actions });
useStore.setState = setState;
useStore.persist = {
  rehydrate: async () => {
    if (typeof localStorage === "undefined") {
      return;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    const decoded = Schema.decodeUnknownExit(persistedEnvelope)(raw);
    if (!Exit.isSuccess(decoded)) {
      setState(initialState);
      return;
    }
    const candidate =
      "draft" in decoded.value ? decoded.value.draft : decoded.value.state;
    if (!isPersistedDraft(candidate)) {
      setState(initialState);
      return;
    }
    const restored = candidate;
    const date = restoreDate(restored.date);
    const scheduledTime = restoreDate(restored.post?.scheduledTime);
    setState({
      ...restored,
      date,
      post: restored.post
        ? { ...restored.post, scheduledTime }
        : initialState.post,
      isMediaUploading: false,
    });
  },
};

// Stable selectors
const postAtom = Atom.map(postStateAtom, (state) => state.post);
const dateTimeAtom = Atom.map(postStateAtom, (state) => ({
  date: state.date,
  time: state.time,
}));
const selectedProvidersAtom = Atom.map(
  postStateAtom,
  (state) => state.selectedSocialProviders
);
const alternativeContentAtom = Atom.map(
  postStateAtom,
  (state) => state.post.alternativeContent
);

export const usePost = () => useAtomValue(postAtom);
export const useAlternativeContent = () => useAtomValue(alternativeContentAtom);
export const useDateTime = () => useAtomValue(dateTimeAtom);
export const useSelectedSocialProviders = () =>
  useAtomValue(selectedProvidersAtom);
export const useIsMediaUploading = () => useAtomValue(mediaUploadingAtom);
export const useAutomationConfig = (providerId: string) =>
  useStore((state) => state.automationConfigs[providerId] ?? null);
// Stable function that gets state directly without React hooks
// Action creators with proper typing
export const postActions = {
  addSocialProvider: (provider: SocialProviderType) =>
    useStore.setState((state) => ({
      selectedSocialProviders: [...state.selectedSocialProviders, provider],
    })),
  removeSocialProvider: (socialId: string) =>
    useStore.setState((state) => {
      const { [socialId]: _ps, ...restProviderSettings } =
        state.providerSettings;
      const { [socialId]: _ac, ...restAutomationConfigs } =
        state.automationConfigs;
      return {
        selectedSocialProviders: state.selectedSocialProviders.filter(
          (provider) => provider.socialId !== socialId
        ),
        post: {
          ...state.post,
          alternativeContent: state.post.alternativeContent.filter(
            (content) => content.socialProvider.socialId !== socialId
          ),
        },
        providerSettings: restProviderSettings,
        automationConfigs: restAutomationConfigs,
      };
    }),
  updatePost: (updates: Partial<FullPostType>) =>
    useStore.setState((state) => ({
      post: { ...state.post, ...updates },
    })),
};

// Hydration helper
// if (typeof window !== 'undefined') {
// useStore.persist.rehydrate();
// }
