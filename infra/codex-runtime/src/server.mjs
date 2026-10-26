import { timingSafeEqual } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Runtime, RuntimeError } from "./runtime.mjs";
import { Store } from "./store.mjs";

export function createHandler(runtime, { secret, enabled = true }) {
  if (!secret || secret.length < 32) {
    throw new Error("A service secret of at least 32 characters is required");
  }
  return async (req, res) => {
    res.setHeader("content-type", "application/json");
    res.setHeader("cache-control", "no-store");
    const send = (status, value) => {
      res.writeHead(status);
      res.end(JSON.stringify(value));
    };
    if (req.url === "/health" && req.method === "GET") {
      send(200, { ok: true, enabled });
      return;
    }
    const supplied = Buffer.from(req.headers.authorization ?? "");
    const expected = Buffer.from(`Bearer ${secret}`);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      send(401, { error: "Unauthorized" });
      return;
    }
    if (req.url !== "/rpc" || req.method !== "POST") {
      send(404, { error: "Not found" });
      return;
    }
    try {
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 512_000) {
          throw new RuntimeError("Request too large", 413);
        }
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      runtime.owner(body.userId);
      const { userId, operation, input = {} } = body;
      if (
        !(
          enabled ||
          ["peek", "disconnect", "cancelLogin", "interrupt"].includes(operation)
        )
      ) {
        throw new RuntimeError("ChatGPT runtime is disabled", 503);
      }
      let result;
      switch (operation) {
        case "peek":
          result = { enabled, ...runtime.connection(runtime.owner(userId)) };
          break;
        case "status":
          result = await runtime.status(userId);
          break;
        case "login":
          result = await runtime.login(userId);
          break;
        case "cancelLogin":
          await runtime.cancelLogin(userId);
          result = { updated: true };
          break;
        case "disconnect":
          await runtime.disconnect(userId);
          result = { updated: true };
          break;
        case "models":
          result = await runtime.models(userId);
          break;
        case "selectRuntime":
          await runtime.selectRuntime(userId, input.selected);
          result = { updated: true };
          break;
        case "selectModel":
          await runtime.selectModel(userId, input.model);
          result = { updated: true };
          break;
        case "submit":
          result = await runtime.submit({ ...input, userId });
          break;
        case "poll":
          result = runtime.poll(userId, input.id, input.scope, input.after);
          break;
        case "context":
          runtime.context(
            userId,
            input.id,
            input.scope,
            input.requestId,
            input.value
          );
          result = { updated: true };
          break;
        case "claimAction":
          result = runtime.claimAction(
            userId,
            input.id,
            input.scope,
            input.actionId,
            input.decision
          );
          break;
        case "resolveAction":
          runtime.resolveAction(
            userId,
            input.id,
            input.scope,
            input.actionId,
            input.result
          );
          result = { updated: true };
          break;
        case "interrupt":
          await runtime.interrupt(userId, input.id, input.scope);
          result = { updated: true };
          break;
        default:
          throw new RuntimeError("Unknown operation", 400);
      }
      send(200, result);
    } catch (error) {
      send(error instanceof RuntimeError ? error.status : 503, {
        error:
          error instanceof RuntimeError
            ? error.message
            : "ChatGPT runtime unavailable. Try again or reconnect.",
      });
    }
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.umask(0o077);
  const root = resolve(process.env.CODEX_RUNTIME_DATA ?? "/data");
  await mkdir(root, { recursive: true, mode: 0o700 });
  // One process per journal/volume. A second replica must never share this directory.
  const store = new Store(join(root, "runtime.sqlite"));
  const runtime = new Runtime({ store, root });
  const server = createServer(
    createHandler(runtime, {
      secret: process.env.CODEX_RUNTIME_SECRET,
      enabled: process.env.CODEX_RUNTIME_ENABLED === "true",
    })
  );
  const timer = setInterval(() => {
    runtime.sweep().catch(() => {
      /* Preserve journal on maintenance failure; next sweep retries cleanup only. */
    });
  }, 15_000);
  timer.unref();
  server.listen(Number(process.env.PORT ?? 8788), "0.0.0.0");
  process.on("SIGTERM", () => {
    server.close();
    clearInterval(timer);
    Promise.all(
      [...runtime.processes.values()].map(async (p) => (await p).close())
    ).finally(() => {
      store.close();
      process.exit(0);
    });
  });
}
