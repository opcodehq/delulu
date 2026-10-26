"use client";

import type { ChatGPTConnectionView } from "@delulu/client";
import { runEffect } from "@delulu/client";
import { Button } from "@delulu/design-system/components/ui/button";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApiClient } from "@/shell/providers/api-client";

export function ChatGPTConnection() {
  const { client } = useApiClient();
  const [connection, setConnection] = useState<ChatGPTConnectionView>();
  const [models, setModels] = useState<readonly { id: string; name: string }[]>(
    []
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++revision.current;
    try {
      const value = await runEffect(client.agentChannels.chatGPTStatus());
      if (!mounted.current || current !== revision.current) {
        return;
      }
      setConnection(value);
      setError("");
      if (value.state === "connected") {
        const choices = await runEffect(client.agentChannels.chatGPTModels());
        if (mounted.current && current === revision.current) {
          setModels(choices);
        }
      } else {
        setModels([]);
      }
    } catch {
      if (mounted.current && current === revision.current) {
        setError(
          "Could not load your ChatGPT connection. Retry when your connection is available."
        );
      }
    }
  }, [client]);
  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => {
      mounted.current = false;
      revision.current += 1;
    };
  }, [refresh]);
  useEffect(() => {
    if (connection?.state !== "pending" || busy) {
      return;
    }
    // Schedule after completion, so a slow request never overlaps another poll.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refresh();
      if (!cancelled) {
        timer = setTimeout(poll, 3000);
      }
    };
    timer = setTimeout(poll, 3000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [connection?.state, busy, refresh]);
  async function change(
    operation: "login" | "cancel" | "disconnect" | "model" | "runtime",
    model?: string
  ) {
    setBusy(true);
    setError("");
    revision.current += 1;
    try {
      if (operation === "login") {
        const result = await runEffect(client.agentChannels.chatGPTLogin());
        if (mounted.current) {
          setConnection(result);
        }
      } else {
        if (operation === "runtime") {
          await runEffect(
            client.agentChannels.chatGPTRuntime({
              payload: { selected: !connection?.selected },
            })
          );
        }
        if (operation === "cancel") {
          await runEffect(client.agentChannels.chatGPTCancel());
        }
        if (operation === "disconnect") {
          await runEffect(client.agentChannels.chatGPTDisconnect());
        }
        if (operation === "model" && model) {
          await runEffect(
            client.agentChannels.chatGPTModel({ payload: { model } })
          );
        }
        await refresh();
      }
    } catch {
      if (mounted.current) {
        setError(
          "Could not update your ChatGPT connection. Stop any active task, then try again."
        );
      }
    } finally {
      if (mounted.current) {
        setBusy(false);
      }
    }
  }
  return (
    <section
      aria-labelledby="chatgpt-title"
      className="space-y-4 rounded-xl border p-5"
      id="chatgpt"
    >
      <div>
        <h2 className="font-medium" id="chatgpt-title">
          ChatGPT for Telegram
        </h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Connect your own ChatGPT account to power your Telegram agent.
          Delulu’s web agent keeps its existing runtime. Subscription limits
          apply; we never switch to paid API usage automatically.
        </p>
      </div>
      {connection || error ? null : <output>Loading connection…</output>}
      {connection?.enabled === false ? (
        <div className="space-y-3">
          <p>ChatGPT connections are not enabled on this installation.</p>
          {connection.selected || connection.state === "connected" ? (
            <Button
              className="min-h-11"
              disabled={busy}
              onClick={() => change("disconnect")}
              variant="outline"
            >
              Disconnect ChatGPT
            </Button>
          ) : null}
        </div>
      ) : null}
      {connection?.enabled ? (
        <>
          <output className="block">
            {connection.state === "connected"
              ? `Connected${connection.account ? ` as ${connection.account}` : ""}${connection.plan ? ` · ${connection.plan}` : ""}`
              : connection.state === "pending"
                ? "Waiting for you to sign in…"
                : "ChatGPT is not connected."}
          </output>
          {connection.login ? (
            <div className="space-y-3 rounded-lg bg-muted p-4">
              <p>Open OpenAI’s sign-in page and enter this code:</p>
              <output
                aria-label="Device code"
                className="block font-mono text-lg"
              >
                {connection.login.code}
              </output>
              <p className="text-sm">
                This request expires at{" "}
                {new Date(connection.login.expiresAt).toLocaleTimeString()}.
                Enable device-code authorization in your ChatGPT security
                settings if prompted.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild className="min-h-11">
                  <a
                    href="https://auth.openai.com/codex/device"
                    rel="noreferrer"
                    target="_blank"
                  >
                    Continue to OpenAI
                  </a>
                </Button>
                <Button
                  className="min-h-11"
                  disabled={busy}
                  onClick={() => change("cancel")}
                  variant="outline"
                >
                  Cancel sign-in
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Button
                className="min-h-11"
                disabled={busy}
                onClick={() => change("login")}
              >
                {connection.state === "connected"
                  ? "Reconnect ChatGPT"
                  : "Connect ChatGPT"}
              </Button>
              {connection.selected || connection.state === "connected" ? (
                <Button
                  className="min-h-11"
                  disabled={busy}
                  onClick={() => change("disconnect")}
                  variant="outline"
                >
                  Disconnect ChatGPT
                </Button>
              ) : null}
            </div>
          )}
          {connection.selected || connection.state === "connected" ? (
            <Button
              className="min-h-11"
              disabled={busy}
              onClick={() => change("runtime")}
              variant="outline"
            >
              {connection.selected
                ? "Use Delulu runtime instead"
                : "Use ChatGPT for Telegram"}
            </Button>
          ) : null}
          {connection.state === "connected" ? (
            <>
              <div className="flex flex-col gap-2">
                <label htmlFor="chatgpt-model">Model</label>
                <select
                  className="min-h-11 rounded-md border bg-background px-3 text-sm"
                  disabled={busy}
                  id="chatgpt-model"
                  onChange={(e) => change("model", e.target.value)}
                  value={connection.model ?? ""}
                >
                  <option disabled value="">
                    Codex default
                  </option>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-sm">
                {connection.selected
                  ? "Using your ChatGPT subscription."
                  : "Telegram is using the Delulu runtime."}{" "}
                Connecting or changing models starts a new Telegram
                conversation; saved Delulu memory and skills remain available.
              </p>
              {[connection.limits?.primary, connection.limits?.secondary].map(
                (limit, index) =>
                  limit ? (
                    <p className="text-sm" key={index}>
                      Usage window {index + 1}: {limit.usedPercent}% used
                      {limit.resetsAt
                        ? ` · resets ${new Date(limit.resetsAt * 1000).toLocaleString()}`
                        : ""}
                    </p>
                  ) : null
              )}
              <Button asChild className="min-h-11" variant="outline">
                <a
                  href="https://chatgpt.com/#settings/Usage"
                  rel="noreferrer"
                  target="_blank"
                >
                  Manage ChatGPT usage
                </a>
              </Button>
            </>
          ) : null}
          {connection.error ? <p role="alert">{connection.error}</p> : null}
        </>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {error ? (
        <Button
          className="min-h-11"
          disabled={busy}
          onClick={() => refresh()}
          variant="outline"
        >
          Retry
        </Button>
      ) : null}
    </section>
  );
}
