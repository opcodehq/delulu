import { createHash, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { CodexProcess } from "./process.mjs";

export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
const terminal = new Set(["completed", "failed", "cancelled"]);
const actions = new Set([
  "remember",
  "forget_memory",
  "create_draft",
  "update_draft",
  "schedule",
  "publish",
]);
const toolResult = (value, success = true) => ({
  contentItems: [{ type: "inputText", text: JSON.stringify(value) }],
  success,
});
export class RuntimeError extends Error {
  constructor(message, status = 409) {
    super(message);
    this.status = status;
  }
}
export const TOOLS = [
  {
    type: "function",
    name: "content_get_context",
    description:
      "Read current Content HQ context for the authorized workspace.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "content_propose_action",
    description:
      "Propose a content or memory action. Waits for explicit user approval and the execution receipt. Never claim success before this returns success.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: [...actions] },
        workspaceId: { type: "string" },
        postId: { type: "string" },
        memoryId: { type: "string" },
        value: {},
      },
      required: ["kind", "workspaceId"],
      additionalProperties: false,
    },
  },
];

export class Runtime {
  constructor({
    store,
    root,
    processFactory = CodexProcess.start,
    now = Date.now,
  }) {
    this.store = store;
    this.root = root;
    this.processFactory = processFactory;
    this.now = now;
    this.touched = new Map();
    this.processes = new Map();
    this.locks = new Map();
    this.active = new Map();
    this.toolRequests = new Map();
    // A dispatched request may have consumed usage or produced effects. Never replay it.
    for (const job of store.unfinished()) {
      if (!terminal.has(job.state)) {
        this.finish(
          job,
          "failed",
          "The agent runner restarted. This task was not repeated. Check any submitted actions before retrying."
        );
      }
    }
  }
  owner(userId) {
    if (typeof userId !== "string" || !userId || userId.length > 200) {
      throw new RuntimeError("Invalid owner", 400);
    }
    return digest(userId);
  }
  connection(owner) {
    return (
      this.store.get(`connection:${owner}`) ??
      this.saveConnection(owner, {
        state: "disconnected",
        selected: false,
        generation: "default",
        model: null,
        account: null,
        plan: null,
        login: null,
        limits: null,
        error: null,
      })
    );
  }
  saveConnection(owner, value) {
    this.store.put(`connection:${owner}`, value);
    return value;
  }
  async locked(owner, work) {
    const previous = this.locks.get(owner) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(work);
    this.locks.set(owner, next);
    try {
      return await next;
    } finally {
      if (this.locks.get(owner) === next) {
        this.locks.delete(owner);
      }
    }
  }
  async process(owner) {
    this.touched.set(owner, this.now());
    if (!this.processes.has(owner)) {
      if (this.processes.size >= 16) {
        throw new RuntimeError(
          "Agent capacity reached. Try again shortly.",
          429
        );
      }
      const promise = this.processFactory({ root: join(this.root, owner) });
      this.processes.set(owner, promise);
      try {
        const rpc = await promise;
        rpc.on("notification", (message) => {
          this.notification(owner, message).catch(() => this.failOwner(owner));
        });
        rpc.on("request", (message) => {
          this.request(owner, rpc, message).catch(() => this.failOwner(owner));
        });
        rpc.on("stopped", () => {
          if (this.processes.get(owner) === promise) {
            this.processes.delete(owner);
            this.failOwner(owner);
          }
        });
      } catch (error) {
        this.processes.delete(owner);
        throw error;
      }
    }
    return this.processes.get(owner);
  }
  failOwner(owner) {
    const id = this.active.get(owner);
    if (id) {
      this.finish(
        this.store.job(id),
        "failed",
        "The agent connection was interrupted. This task was not repeated."
      );
    }
  }
  async status(userId) {
    const owner = this.owner(userId);
    return this.locked(owner, async () => {
      let connection = this.connection(owner);
      this.saveConnection(owner, connection);
      if (
        connection.state === "pending" &&
        (!this.processes.has(owner) || connection.login.expiresAt <= this.now())
      ) {
        if (this.processes.has(owner)) {
          await (await this.process(owner))
            .call("account/login/cancel", { loginId: connection.login.id })
            .catch(() => undefined);
        }
        connection = this.saveConnection(owner, {
          ...connection,
          state: "expired",
          login: null,
          error: "Sign-in expired or was interrupted. Try again.",
        });
      }
      if (connection.state === "connected") {
        const rpc = await this.process(owner);
        const result = await rpc.call("account/read", { refreshToken: true });
        if (!result.account || result.account.type !== "chatgpt") {
          connection = this.saveConnection(owner, {
            ...connection,
            state: "reconnect",
            error: "Reconnect ChatGPT to continue.",
          });
        } else {
          const limits = await rpc
            .call("account/rateLimits/read")
            .catch(() => null);
          connection = this.saveConnection(owner, {
            ...connection,
            account: result.account.email ?? null,
            plan: result.account.planType ?? null,
            limits: sanitizeLimits(limits?.rateLimits),
          });
        }
      }
      return { enabled: true, ...connection };
    });
  }
  async login(userId) {
    const owner = this.owner(userId);
    return this.locked(owner, async () => {
      const old = this.connection(owner);
      if (this.active.has(owner)) {
        throw new RuntimeError("Stop your active task before reconnecting.");
      }
      if (
        old.state === "pending" &&
        old.login.expiresAt > this.now() &&
        this.processes.has(owner)
      ) {
        return { enabled: true, ...old };
      }
      const rpc = await this.process(owner);
      if (old.login) {
        await rpc
          .call("account/login/cancel", { loginId: old.login.id })
          .catch(() => undefined);
      }
      const result = await rpc.call("account/login/start", {
        type: "chatgptDeviceCode",
      });
      if (
        result.type !== "chatgptDeviceCode" ||
        typeof result.loginId !== "string" ||
        typeof result.userCode !== "string" ||
        result.verificationUrl !== "https://auth.openai.com/codex/device"
      ) {
        throw new RuntimeError("Unexpected device login response");
      }
      return {
        enabled: true,
        ...this.saveConnection(owner, {
          ...old,
          state: "pending",
          login: {
            id: result.loginId,
            code: result.userCode,
            url: result.verificationUrl,
            expiresAt: this.now() + 600_000,
          },
          error: null,
        }),
      };
    });
  }
  async cancelLogin(userId) {
    const owner = this.owner(userId);
    return this.locked(owner, async () => {
      const connection = this.connection(owner);
      if (connection.login && this.processes.has(owner)) {
        await (await this.process(owner)).call("account/login/cancel", {
          loginId: connection.login.id,
        });
      }
      this.saveConnection(owner, {
        ...connection,
        login: null,
        state: connection.selected ? "reconnect" : "disconnected",
        error: null,
      });
    });
  }
  async models(userId) {
    const owner = this.owner(userId);
    return this.locked(owner, async () => {
      if (this.connection(owner).state !== "connected") {
        throw new RuntimeError("Connect ChatGPT first");
      }
      const rpc = await this.process(owner);
      const result = await rpc.call("model/list", { includeHidden: false });
      return (result.data ?? []).map((m) => ({
        id: m.model ?? m.id,
        name: m.displayName ?? m.id,
        isDefault: Boolean(m.isDefault),
      }));
    });
  }
  async selectModel(userId, model) {
    const models = await this.models(userId);
    if (!models.some((m) => m.id === model)) {
      throw new RuntimeError("Model is unavailable");
    }
    const owner = this.owner(userId);
    return this.locked(owner, () => {
      if (this.active.has(owner)) {
        throw new RuntimeError("Stop your active task before changing models.");
      }
      const c = this.connection(owner);
      this.saveConnection(owner, { ...c, model, generation: randomUUID() });
    });
  }
  async selectRuntime(userId, selected) {
    const owner = this.owner(userId);
    return this.locked(owner, () => {
      const c = this.connection(owner);
      if (this.active.has(owner)) {
        throw new RuntimeError("Stop your active task first.");
      }
      if (
        typeof selected !== "boolean" ||
        (selected && c.state !== "connected")
      ) {
        throw new RuntimeError("Connect ChatGPT first");
      }
      this.saveConnection(owner, { ...c, selected, generation: randomUUID() });
    });
  }
  async disconnect(userId) {
    const owner = this.owner(userId);
    return this.locked(owner, async () => {
      const c = this.connection(owner);
      // Disable admission durably before any remote cleanup. No automatic API fallback.
      this.saveConnection(owner, {
        ...c,
        state: "disconnected",
        generation: randomUUID(),
        login: null,
        account: null,
        plan: null,
        limits: null,
        error: null,
      });
      for (const job of this.store.unfinished()) {
        if (job.owner === owner) {
          this.finish(
            job,
            "cancelled",
            "ChatGPT disconnected. Any action already submitted may need reconciliation."
          );
        }
      }
      const pending = this.processes.get(owner);
      if (pending) {
        const rpc = await pending;
        await rpc.call("account/logout").catch(() => undefined);
        await rpc.close();
        this.processes.delete(owner);
      }
      await rm(join(this.root, owner, "auth", "auth.json"), { force: true });
    });
  }
  async notification(owner, { method, params }) {
    if (method === "account/login/completed") {
      const c = this.connection(owner);
      if (c.state !== "pending" || params.loginId !== c.login?.id) {
        return;
      }
      if (!params.success || c.login.expiresAt <= this.now()) {
        this.saveConnection(owner, {
          ...c,
          state: "reconnect",
          login: null,
          error: "Sign-in was not completed. Try again.",
        });
        return;
      }
      const result = await (await this.process(owner)).call("account/read", {
        refreshToken: false,
      });
      // Recheck after I/O: cancellation/disconnect may have won the race.
      if (this.connection(owner).login?.id !== params.loginId) {
        return;
      }
      if (result.account?.type !== "chatgpt") {
        throw new Error("Wrong account type");
      }
      this.saveConnection(owner, {
        ...c,
        state: "connected",
        selected: true,
        generation: randomUUID(),
        login: null,
        account: result.account.email ?? null,
        plan: result.account.planType ?? null,
        error: null,
      });
      return;
    }
    const id = this.active.get(owner);
    if (!id) {
      return;
    }
    const job = this.store.job(id);
    if (params?.threadId && job.threadId && params.threadId !== job.threadId) {
      return;
    }
    const turnId = params?.turnId ?? params?.turn?.id;
    if (job.turnId && turnId && job.turnId !== turnId) {
      return;
    }
    if (method === "item/completed" && params.item?.type === "agentMessage") {
      job.text = String(params.item.text ?? "").slice(0, 40_000);
      this.store.save(job);
    }
    if (method === "turn/completed") {
      const completed = params.turn?.status === "completed";
      this.finish(
        job,
        completed ? "completed" : "failed",
        completed
          ? job.text || "Completed."
          : "The agent could not complete this turn. Check your ChatGPT connection and usage limits; no API fallback was used."
      );
    }
  }
  ownedJob(userId, id, scope) {
    const job = this.store.job(id);
    if (!job || job.owner !== this.owner(userId) || job.scope !== scope) {
      throw new RuntimeError("Task unavailable", 404);
    }
    return job;
  }
  async submit(input) {
    const owner = this.owner(input.userId);
    return this.locked(owner, async () => {
      const fingerprint = digest(
        JSON.stringify([owner, input.scope, input.generation, input.messageKey])
      );
      const id = fingerprint;
      const existing = this.store.job(id);
      if (existing) {
        return this.publicJob(existing);
      }
      const c = this.connection(owner);
      if (
        !c.selected ||
        c.state !== "connected" ||
        c.generation !== input.generation
      ) {
        throw new RuntimeError(
          "Reconnect ChatGPT or start a new chat to continue."
        );
      }
      if (this.active.has(owner)) {
        throw new RuntimeError(
          "Another ChatGPT task is active. Finish or stop it first.",
          429
        );
      }
      if (
        typeof input.prompt !== "string" ||
        input.prompt.length > 80_000 ||
        typeof input.scope !== "string" ||
        input.scope.length > 800 ||
        typeof input.workspaceId !== "string"
      ) {
        throw new RuntimeError("Invalid task", 400);
      }
      const admissionRpc = await this.process(owner);
      const account = await admissionRpc.call("account/read", {
        refreshToken: true,
      });
      if (account.account?.type !== "chatgpt") {
        this.saveConnection(owner, {
          ...c,
          state: "reconnect",
          error: "Reconnect ChatGPT to continue.",
        });
        throw new RuntimeError("Reconnect ChatGPT to continue.");
      }
      const limits = await admissionRpc
        .call("account/rateLimits/read")
        .catch(() => null);
      const usage = sanitizeLimits(limits?.rateLimits);
      this.saveConnection(owner, { ...c, limits: usage });
      if (
        [usage?.primary, usage?.secondary].some(
          (w) =>
            w &&
            w.usedPercent >= 100 &&
            (!w.resetsAt || w.resetsAt * 1000 > this.now())
        )
      ) {
        throw new RuntimeError(
          "ChatGPT usage limit reached. Wait for your allowance to reset.",
          429
        );
      }
      const job = {
        id,
        owner,
        scope: input.scope,
        fingerprint,
        generation: c.generation,
        workspaceId: input.workspaceId,
        state: "running",
        createdAt: this.now(),
        text: "",
        events: [],
        sequence: 0,
        actions: {},
      };
      this.store.save(job);
      this.active.set(owner, id);
      try {
        const rpc = await this.process(owner);
        const threadKey = `thread:${digest(`${owner}:${input.scope}`)}`;
        const saved = this.store.get(threadKey);
        const result = await rpc.call(
          saved ? "thread/resume" : "thread/start",
          {
            ...(saved ? { threadId: saved.id } : { dynamicTools: TOOLS }),
            model: c.model,
            cwd: rpc.cwd,
            approvalPolicy: "on-request",
            sandbox: "read-only",
            developerInstructions:
              "You are Delulu. CONTENT.getContext means content_get_context; CONTENT.proposeAction means content_propose_action. Use only those content tools. They are scoped by the server. Content actions require explicit approval. Do not access local files or execute commands.",
          }
        );
        job.threadId = result.thread.id;
        this.store.put(threadKey, { id: job.threadId });
        this.store.save(job);
        const turn = await rpc.call("turn/start", {
          threadId: job.threadId,
          input: [{ type: "text", text: input.prompt }],
          sandboxPolicy: {
            type: "readOnly",
            access: {
              type: "restricted",
              includePlatformDefaults: false,
              readableRoots: [rpc.cwd],
            },
          },
        });
        const latest = this.store.job(id);
        latest.turnId = turn.turn.id;
        this.store.save(latest);
      } catch {
        this.finish(
          this.store.job(id),
          "failed",
          "The ChatGPT task could not start. Reconnect or check model availability. It was not retried."
        );
      }
      return this.publicJob(this.store.job(id));
    });
  }
  emit(job, response) {
    job.sequence += 1;
    job.events.push({ sequence: job.sequence, response });
    this.store.save(job);
  }
  finish(job, state, text) {
    if (!job || terminal.has(job.state)) {
      return;
    }
    job.state = state;
    this.emit(job, {
      text,
      usage: {
        provider: "chatgpt",
        model: "subscription",
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        costMicros: 0,
      },
    });
    if (this.active.get(job.owner) === job.id) {
      this.active.delete(job.owner);
    }
    this.toolRequests.delete(job.id);
  }
  publicJob(job) {
    return {
      id: job.id,
      state: job.state,
      events: job.events,
      request: job.request ?? null,
    };
  }
  async request(owner, rpc, message) {
    const job = this.store.job(this.active.get(owner) ?? "");
    if (
      !job ||
      terminal.has(job.state) ||
      message.method !== "item/tool/call"
    ) {
      rpc.reject(message.id);
      return;
    }
    const { tool, arguments: args, threadId } = message.params;
    if (
      threadId !== job.threadId ||
      !["content_get_context", "content_propose_action"].includes(tool) ||
      this.toolRequests.has(job.id)
    ) {
      rpc.reject(message.id);
      return;
    }
    if ((job.toolCount ?? 0) >= 40) {
      rpc.reply(
        message.id,
        toolResult({ error: "Task tool limit reached" }, false)
      );
      return;
    }
    job.toolCount = (job.toolCount ?? 0) + 1;
    const requestId = randomUUID();
    this.toolRequests.set(job.id, { rpc, rpcId: message.id, requestId });
    if (tool === "content_get_context") {
      job.request = { id: requestId, kind: "context" };
      this.store.save(job);
      return;
    }
    if (
      !args ||
      args.workspaceId !== job.workspaceId ||
      !actions.has(args.kind)
    ) {
      this.toolRequests.delete(job.id);
      rpc.reply(
        message.id,
        toolResult({ error: "Invalid workspace action" }, false)
      );
      return;
    }
    const actionId = randomUUID();
    const summary = `${args.kind.replaceAll("_", " ")}: ${JSON.stringify(args).slice(0, 2500)}`;
    job.actions[actionId] = {
      value: args,
      requestId,
      state: "pending",
      expiresAt: this.now() + 600_000,
    };
    job.state = "waiting_approval";
    this.emit(job, {
      text: "Please review the proposed action.",
      actions: [
        { id: actionId, kind: args.kind, summary, risk: "consequential" },
      ],
    });
  }
  poll(userId, id, scope, after = 0) {
    const job = this.ownedJob(userId, id, scope);
    return {
      ...this.publicJob(job),
      events: job.events.filter((e) => e.sequence > after),
    };
  }
  context(userId, id, scope, requestId, value) {
    const job = this.ownedJob(userId, id, scope);
    const pending = this.toolRequests.get(id);
    if (job.request?.id !== requestId || pending?.requestId !== requestId) {
      return;
    }
    job.request = undefined;
    this.store.save(job);
    this.toolRequests.delete(id);
    pending.rpc.reply(pending.rpcId, toolResult(value));
  }
  claimAction(userId, id, scope, actionId, decision) {
    const job = this.ownedJob(userId, id, scope);
    const c = this.connection(job.owner);
    const action = job.actions[actionId];
    if (
      c.state !== "connected" ||
      c.generation !== job.generation ||
      terminal.has(job.state) ||
      !action ||
      action.state !== "pending" ||
      action.expiresAt <= this.now()
    ) {
      throw new RuntimeError("Approval expired or already handled");
    }
    if (!["approved", "rejected"].includes(decision)) {
      throw new RuntimeError("Invalid decision", 400);
    }
    action.state = "executing";
    action.decision = decision;
    this.store.save(job);
    return action.value;
  }
  resolveAction(userId, id, scope, actionId, result) {
    const job = this.ownedJob(userId, id, scope);
    const action = job.actions[actionId];
    if (!action || action.state !== "executing" || terminal.has(job.state)) {
      return;
    }
    action.state = "resolved";
    job.state = "running";
    this.store.save(job);
    const pending = this.toolRequests.get(id);
    if (pending?.requestId !== action.requestId) {
      this.finish(
        job,
        "failed",
        "Action outcome recorded, but the agent continuation is unavailable."
      );
      return;
    }
    this.toolRequests.delete(id);
    pending.rpc.reply(pending.rpcId, toolResult(result, result.ok === true));
  }
  async interrupt(userId, id, scope) {
    const job = this.ownedJob(userId, id, scope);
    if (terminal.has(job.state)) {
      return;
    }
    this.finish(
      job,
      "cancelled",
      "Stopped. Any action already submitted may need reconciliation."
    );
    const rpc = await this.processes.get(job.owner);
    if (rpc) {
      await rpc.close();
      this.processes.delete(job.owner);
    }
  }
  async sweep() {
    for (const [owner, pending] of this.processes) {
      if (this.locks.has(owner)) {
        continue;
      }
      const c = this.connection(owner);
      if (c.state === "pending" && c.login.expiresAt <= this.now()) {
        await this.locked(owner, async () => {
          this.saveConnection(owner, {
            ...c,
            state: "expired",
            login: null,
            error: "Sign-in expired. Try again.",
          });
          await (await pending)
            .call("account/login/cancel", { loginId: c.login.id })
            .catch(() => undefined);
        });
      }
      if (
        !(this.active.has(owner) || this.locks.has(owner)) &&
        this.connection(owner).state !== "pending" &&
        this.now() - (this.touched.get(owner) ?? 0) > 5 * 60_000
      ) {
        this.processes.delete(owner);
        this.touched.delete(owner);
        await (await pending).close();
      }
    }
    for (const job of [
      ...this.store.unfinished(),
      ...this.store.compactable(this.now() - 24 * 60 * 60_000),
    ]) {
      if (
        terminal.has(job.state) &&
        this.now() - job.createdAt > 24 * 60 * 60_000 &&
        !job.compacted
      ) {
        // Keep ownership and deduplication tombstones, discard content and action payloads.
        job.sequence += 1;
        job.events = [
          {
            sequence: job.sequence,
            response: {
              text: "This task’s stored result expired. It was not repeated. Check the workspace before retrying.",
            },
          },
        ];
        job.actions = {};
        job.text = "";
        job.request = undefined;
        job.compacted = true;
        this.store.save(job);
      }
      if (
        !terminal.has(job.state) &&
        this.now() - job.createdAt > 20 * 60_000
      ) {
        this.finish(job, "failed", "Task timed out. It was not repeated.");
        const rpc = await this.processes.get(job.owner);
        await rpc?.close();
        this.processes.delete(job.owner);
      }
    }
  }
}
function sanitizeLimits(value) {
  if (!value) {
    return null;
  }
  const window = (v) =>
    v && Number.isFinite(v.usedPercent)
      ? {
          usedPercent: v.usedPercent,
          resetsAt: Number.isFinite(v.resetsAt) ? v.resetsAt : null,
        }
      : null;
  return { primary: window(value.primary), secondary: window(value.secondary) };
}
