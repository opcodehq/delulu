import { useEffect, useState } from "react";
import { ContentModule } from "@/features/publishing/editor/content-module";
import { useStore } from "@/features/publishing/store";
import { useWorkspace } from "@/shell/providers/workspace";

export function TwitterEditorFixture() {
  const [initialized, setInitialized] = useState(false);
  const { workspaceId } = useWorkspace();
  useEffect(() => {
    if (!workspaceId) {
      return;
    }
    const state = useStore.getState();
    state.reset();
    state.setSelectedSocialProviders([
      { socialId: "connection_twitter", socialType: "TWITTER", name: "Writer" },
    ]);
    state.setPost({
      content: [
        {
          order: 0,
          name: "Post",
          text: "My article body",
          media: [],
          tags: [],
        },
      ],
      alternativeContent: [],
    });
    // Tests drive composer state here instead of through on-screen controls.
    Reflect.set(window, "composerStore", useStore);
    Reflect.set(
      window,
      "twitterSettings",
      () =>
        useStore.getState().providerSettings.connection_twitter?.settings ?? {}
    );
    setInitialized(true);
  }, [workspaceId]);
  if (!(workspaceId && initialized)) {
    return <p>Loading Twitter editor</p>;
  }
  return (
    <main className="space-y-4 p-4">
      <h1 className="sr-only">Twitter editor</h1>
      <ContentModule
        onOpenChannel={(id) => Reflect.set(window, "openedChannel", id)}
        socialId="global"
        socialType="DEFAULT"
      />
    </main>
  );
}
