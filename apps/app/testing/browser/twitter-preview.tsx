import { Button } from "@delulu/design-system/components/ui/button";
import { useEffect, useState } from "react";
import { ContentModule } from "@/features/publishing/editor/content-module";
import { PlatformSettingsDialog } from "@/features/publishing/editor/sidebar/platform-settings-dialog";
import { useStore } from "@/features/publishing/store";
import { useWorkspace } from "@/shell/providers/workspace";

export function TwitterEditorFixture() {
  const [open, setOpen] = useState(false);
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
    setInitialized(true);
  }, [workspaceId]);
  const settings = useStore((state) => state.providerSettings);
  if (!(workspaceId && initialized)) {
    return <p>Loading Twitter editor</p>;
  }
  return (
    <main className="space-y-4 p-4">
      <h1>Twitter editor</h1>
      <Button className="min-h-11" onClick={() => setOpen(true)}>
        X settings
      </Button>
      <ContentModule socialId="default" socialType="DEFAULT" />
      <PlatformSettingsDialog
        isOpen={open}
        onClose={() => setOpen(false)}
        platform="TWITTER"
        platformName="X"
        socialId="connection_twitter"
      />
      <output
        className="block max-w-full break-all"
        data-testid="twitter-settings"
      >
        {JSON.stringify(settings.connection_twitter?.settings ?? {})}
      </output>
    </main>
  );
}
