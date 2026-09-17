const MARKDOWN_LINK = /\[([^\]\n]{1,64})\]\((https:\/\/[^\s)]+)\)/g;

export function connectionButtons(appOrigin: string, workspaceId: string) {
  return [
    ["LinkedIn", "LINKEDIN"],
    ["X / Twitter", "TWITTER"],
  ].map(([name, platform]) => {
    const url = new URL("/connect/account", appOrigin);
    url.searchParams.set("workspaceId", workspaceId);
    url.searchParams.set("platform", platform!);
    return { text: `Connect ${name}`, url: url.href };
  });
}

/** Only server-generated workspace links become buttons. Model URLs confer no authority. */
export function presentTelegramReply(
  text: string,
  links: readonly { text: string; url: string }[]
) {
  const selected = new Map<string, { text: string; url: string }>();
  const body = text.replace(
    MARKDOWN_LINK,
    (original, _label: string, url: string) => {
      const link = links.find((candidate) => candidate.url === url);
      if (!link) {
        return original;
      }
      selected.set(url, link);
      return link.text;
    }
  );
  return { text: body, rows: [...selected.values()].map((link) => [link]) };
}

export function approvalLabel(kind: string, index: number) {
  const labels: Record<string, string> = {
    create_draft: "Save draft",
    update_draft: "Save changes",
    schedule: "Schedule",
    publish: "Publish",
    remember: "Save memory",
    forget_memory: "Forget memory",
  };
  return labels[kind] ?? `Approve ${index + 1}`;
}
