import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./post";

const values = new Map<string, string>();
const storage: Storage = {
  get length() {
    return values.size;
  },
  clear: () => values.clear(),
  getItem: (key) => values.get(key) ?? null,
  key: (index) => [...values.keys()][index] ?? null,
  removeItem: (key) => values.delete(key),
  setItem: (key, value) => values.set(key, value),
};

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: storage,
});

describe("post draft persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.getState().reset();
  });

  it("migrates a legacy draft and resets transient upload state", async () => {
    const scheduledTime = "2026-07-15T08:30:00.000Z";
    const state = useStore.getState();
    localStorage.setItem(
      "post-storage",
      JSON.stringify({
        version: 0,
        state: {
          ...state,
          date: scheduledTime,
          post: { ...state.post, scheduledTime },
          isMediaUploading: true,
        },
      })
    );

    await useStore.persist.rehydrate();

    const restored = useStore.getState();
    expect(restored.date).toBeInstanceOf(Date);
    expect(restored.post.scheduledTime).toBeInstanceOf(Date);
    expect(restored.isMediaUploading).toBe(false);
    expect(
      JSON.parse(localStorage.getItem("post-storage") ?? "{}").version
    ).toBe(1);
  });

  it("falls back to a clean draft for malformed storage", async () => {
    localStorage.setItem("post-storage", "not-json");
    await useStore.persist.rehydrate();
    expect(useStore.getState().post.content[0]?.text).toBe("");
    expect(useStore.getState().isMediaUploading).toBe(false);
  });

  it("discards incompatible nested editor data and invalid dates", async () => {
    localStorage.setItem(
      "post-storage",
      JSON.stringify({
        version: 1,
        draft: {
          date: "not-a-date",
          post: { content: "invalid", alternativeContent: [] },
        },
      })
    );

    await useStore.persist.rehydrate();

    expect(useStore.getState().date).toBeUndefined();
    expect(useStore.getState().post.content[0]?.text).toBe("");
  });
});

describe("post graph hydration", () => {
  beforeEach(() => {
    useStore.getState().reset();
  });

  it("restores ordered default and connection-specific thread content", () => {
    useStore.getState().loadPost(
      {
        id: "post_thread",
        workspaceId: "workspace_test",
        groups: [
          {
            id: "post_group_default",
            isDefault: true,
            segments: [
              { text: "Default one", media: [] },
              { text: "Default two", media: [] },
            ],
          },
          {
            id: "post_group_threads",
            isDefault: false,
            segments: [
              { text: "Threads one", media: [] },
              { text: "Threads two", media: [] },
            ],
          },
        ],
        targets: [
          {
            connectionId: "connection_threads",
            groupId: "post_group_threads",
            scheduledAt: null,
            settings: {
              platform: "THREADS",
              values: { replyControl: "everyone" },
            },
          },
        ],
      },
      new Map(),
      [
        {
          id: "connection_threads",
          platform: "THREADS",
          displayName: "Product Notes",
          username: "product-notes",
          profileId: "profile_threads",
        },
      ]
    );

    const state = useStore.getState();
    expect(state.post.content.map((item) => item.text)).toEqual([
      "Default one",
      "Default two",
    ]);
    expect(
      state.post.alternativeContent[0]?.content.map((item) => item.text)
    ).toEqual(["Threads one", "Threads two"]);
    expect(state.selectedSocialProviders).toEqual([
      {
        socialId: "connection_threads",
        name: "Product Notes",
        socialType: "THREADS",
      },
    ]);
  });
});
