// biome-ignore-all lint/style/noDoneCallback: node:test passes a TestContext, not a done callback.
const ERROR_PATTERN_0 = /Reconnect/;
const ERROR_PATTERN_1 = /active/;
const ERROR_PATTERN_2 = /already handled/;
const ERROR_PATTERN_4 = /locked/;
const ERROR_PATTERN_6 = /not repeated/;
const ERROR_PATTERN_11 = /unavailable/;
const ERROR_PATTERN_12 = /usage limit reached/;

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Runtime } from "../src/runtime.mjs";
import { createHandler } from "../src/server.mjs";
import { Store } from "../src/store.mjs";

class FakeCodex extends EventEmitter {
  constructor() {
    super();
    this.cwd = "/work";
    this.calls = [];
    this.replies = [];
    this.account = {
      type: "chatgpt",
      email: "user@example.test",
      planType: "plus",
    };
  }
  async call(method, params) {
    this.calls.push({ method, params });
    if (method === "account/login/start") {
      return {
        type: "chatgptDeviceCode",
        loginId: "login",
        verificationUrl: "https://auth.openai.com/codex/device",
        userCode: "ABCD-1234",
      };
    }
    if (method === "account/read") {
      return { account: this.account };
    }
    if (method === "model/list") {
      return {
        data: [
          { id: "test-model", displayName: "Test model", isDefault: true },
        ],
      };
    }
    if (method.startsWith("thread/")) {
      return { thread: { id: `thread-${this.calls.length}` } };
    }
    if (method === "turn/start") {
      return { turn: { id: "turn" } };
    }
    return {};
  }
  reply(id, result) {
    this.replies.push({ id, result });
  }
  reject(id) {
    this.replies.push({ id, rejected: true });
  }
  async close() {
    this.closed = true;
    this.emit("stopped");
  }
}
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "delulu-runtime-test-"));
  const store = new Store(join(root, "state.sqlite"));
  const processes = [];
  let now = 1000;
  const runtime = new Runtime({
    store,
    root,
    now: () => now,
    processFactory: async () => {
      const rpc = new FakeCodex();
      processes.push(rpc);
      return rpc;
    },
  });
  t.after(async () => {
    store.close();
    await rm(root, { recursive: true, force: true });
  });
  const connect = async (userId = "user-a") => {
    await runtime.login(userId);
    await runtime.notification(runtime.owner(userId), {
      method: "account/login/completed",
      params: { loginId: "login", success: true },
    });
    return runtime.connection(runtime.owner(userId));
  };
  const input = (
    c,
    userId = "user-a",
    scope = "workspace-a:chat-1",
    messageKey = "message-1"
  ) => ({
    userId,
    scope,
    generation: c.generation,
    workspaceId: "workspace-a",
    messageKey,
    prompt: "Draft a post.",
  });
  return {
    root,
    store,
    runtime,
    processes,
    connect,
    input,
    advance: (ms) => {
      now += ms;
    },
  };
}

test("login, model discovery, selection and owner-isolated sessions", async (t) => {
  const f = await fixture(t);
  const c = await f.connect();
  assert.equal(c.state, "connected");
  assert.equal(c.selected, true);
  assert.equal((await f.runtime.models("user-a"))[0].id, "test-model");
  await assert.rejects(
    f.runtime.selectModel("user-a", "missing"),
    ERROR_PATTERN_11
  );
  await f.runtime.selectModel("user-a", "test-model");
  const a = f.runtime.connection(f.runtime.owner("user-a"));
  assert.notEqual(a.generation, c.generation);
  const b = await f.connect("user-b");
  const job = await f.runtime.submit(f.input(a));
  const other = await f.runtime.submit(f.input(b, "user-b"));
  assert.notEqual(job.id, other.id);
  assert.throws(
    () => f.runtime.poll("user-b", job.id, "workspace-a:chat-1"),
    ERROR_PATTERN_11
  );
  assert.throws(
    () => f.runtime.poll("user-a", job.id, "workspace-b:chat-1"),
    ERROR_PATTERN_11
  );
});

test("denied, cancelled, expired and restarted device login never enables inference", async (t) => {
  const f = await fixture(t);
  await f.runtime.login("user-a");
  await f.runtime.notification(f.runtime.owner("user-a"), {
    method: "account/login/completed",
    params: { loginId: "login", success: false },
  });
  assert.equal((await f.runtime.status("user-a")).state, "reconnect");
  await f.runtime.login("user-a");
  await f.runtime.cancelLogin("user-a");
  await f.runtime.notification(f.runtime.owner("user-a"), {
    method: "account/login/completed",
    params: { loginId: "login", success: true },
  });
  assert.equal((await f.runtime.status("user-a")).selected, false);
  await f.runtime.login("user-a");
  f.advance(600_001);
  assert.equal((await f.runtime.status("user-a")).state, "expired");
  await f.runtime.login("user-a");
  f.runtime.processes.clear();
  assert.equal((await f.runtime.status("user-a")).state, "expired");
});

test("concurrent status calls serialize refreshes and duplicate submissions invoke once", async (t) => {
  const f = await fixture(t);
  const c = await f.connect();
  const rpc = f.processes[0];
  let refreshing = 0;
  let peak = 0;
  const original = rpc.call.bind(rpc);
  rpc.call = async (method, params) => {
    if (method !== "account/read") {
      return original(method, params);
    }
    refreshing++;
    peak = Math.max(peak, refreshing);
    await new Promise((resolve) => setImmediate(resolve));
    refreshing--;
    return original(method, params);
  };
  await Promise.all([f.runtime.status("user-a"), f.runtime.status("user-a")]);
  assert.equal(peak, 1);
  const [first, second] = await Promise.all([
    f.runtime.submit(f.input(c)),
    f.runtime.submit(f.input(c)),
  ]);
  assert.equal(first.id, second.id);
  assert.equal(rpc.calls.filter((x) => x.method === "turn/start").length, 1);
  await assert.rejects(
    f.runtime.submit(f.input(c, "user-a", "another-chat", "second")),
    ERROR_PATTERN_1
  );
});

test("context and actions go through the broker, and approvals cannot be claimed twice", async (t) => {
  const f = await fixture(t);
  const c = await f.connect();
  const job = await f.runtime.submit(f.input(c));
  const rpc = f.processes[0];
  const owner = f.runtime.owner("user-a");
  const threadId = f.store.job(job.id).threadId;
  await f.runtime.request(owner, rpc, {
    id: 10,
    method: "item/tool/call",
    params: { threadId, tool: "content_get_context", arguments: {} },
  });
  const requested = f.runtime.poll("user-a", job.id, "workspace-a:chat-1");
  f.runtime.context(
    "user-a",
    job.id,
    "workspace-a:chat-1",
    requested.request.id,
    { connections: [] }
  );
  assert.equal(rpc.replies[0].result.success, true);
  await f.runtime.request(owner, rpc, {
    id: 11,
    method: "item/tool/call",
    params: {
      threadId,
      tool: "content_propose_action",
      arguments: {
        kind: "publish",
        workspaceId: "workspace-b",
        postId: "post",
      },
    },
  });
  assert.equal(rpc.replies[1].result.success, false);
  await f.runtime.request(owner, rpc, {
    id: 12,
    method: "item/tool/call",
    params: {
      threadId,
      tool: "content_propose_action",
      arguments: {
        kind: "create_draft",
        workspaceId: "workspace-a",
        value: { text: "Draft" },
      },
    },
  });
  const event = f.runtime.poll("user-a", job.id, "workspace-a:chat-1")
    .events[0];
  const id = event.response.actions[0].id;
  assert.equal(
    rpc.replies.length,
    2,
    "tool cannot report success before approval"
  );
  assert.equal(
    f.runtime.claimAction(
      "user-a",
      job.id,
      "workspace-a:chat-1",
      id,
      "approved"
    ).kind,
    "create_draft"
  );
  assert.throws(
    () =>
      f.runtime.claimAction(
        "user-a",
        job.id,
        "workspace-a:chat-1",
        id,
        "approved"
      ),
    ERROR_PATTERN_2
  );
  f.runtime.resolveAction("user-a", job.id, "workspace-a:chat-1", id, {
    ok: true,
    result: { postId: "post" },
  });
  assert.equal(rpc.replies.at(-1).result.success, true);
  await f.runtime.notification(owner, {
    method: "item/completed",
    params: { threadId, item: { type: "agentMessage", text: "Draft saved." } },
  });
  await f.runtime.notification(owner, {
    method: "turn/completed",
    params: { threadId, turn: { status: "completed" } },
  });
  assert.equal(
    f.runtime.poll("user-a", job.id, "workspace-a:chat-1", event.sequence)
      .events[0].response.text,
    "Draft saved."
  );
});

test("restart preserves terminal delivery and fails uncertain runs without replay", async (t) => {
  const f = await fixture(t);
  const c = await f.connect();
  const input = f.input(c);
  const job = await f.runtime.submit(input);
  const restarted = new Runtime({
    store: f.store,
    root: f.root,
    processFactory: async () => {
      throw new Error("must not run inference");
    },
  });
  const recovered = await restarted.submit(input);
  assert.equal(recovered.state, "failed");
  assert.match(recovered.events[0].response.text, ERROR_PATTERN_6);
  assert.equal(recovered.id, job.id);
  assert.deepEqual(restarted.poll("user-a", job.id, input.scope), recovered);
});

test("disconnect cancels active work, removes credentials, and never chooses paid fallback", async (t) => {
  const f = await fixture(t);
  const c = await f.connect();
  const job = await f.runtime.submit(f.input(c));
  const authDir = join(f.root, f.runtime.owner("user-a"), "auth");
  await mkdir(authDir, { recursive: true });
  const authFile = join(authDir, "auth.json");
  await writeFile(
    authFile,
    JSON.stringify({ fixture: "private authentication" })
  );
  await f.runtime.disconnect("user-a");
  await assert.rejects(access(authFile), { code: "ENOENT" });
  assert.equal(f.processes[0].closed, true);
  assert.equal(
    f.runtime.poll("user-a", job.id, "workspace-a:chat-1").state,
    "cancelled"
  );
  const disconnected = await f.runtime.status("user-a");
  assert.equal(disconnected.selected, true);
  assert.equal(disconnected.state, "disconnected");
  await assert.rejects(
    f.runtime.submit(f.input(c, "user-a", "next", "next")),
    ERROR_PATTERN_0
  );
});

test("model failure, token revocation and interrupted streams never become success", async (t) => {
  const f = await fixture(t);
  const c = await f.connect();
  const job = await f.runtime.submit(f.input(c));
  const owner = f.runtime.owner("user-a");
  await f.runtime.notification(owner, {
    method: "turn/completed",
    params: {
      threadId: f.store.job(job.id).threadId,
      turn: { status: "failed", error: { message: "usage limit" } },
    },
  });
  assert.equal(
    f.runtime.poll("user-a", job.id, "workspace-a:chat-1").state,
    "failed"
  );
  f.processes[0].account = null;
  assert.equal((await f.runtime.status("user-a")).state, "reconnect");
  await assert.rejects(
    f.runtime.submit(f.input(c, "user-a", "new", "new")),
    ERROR_PATTERN_0
  );
});

test("runner HTTP rejects unauthenticated and disabled calls without provisioning", async (t) => {
  const f = await fixture(t);
  const secret = "s".repeat(32);
  const server = createServer(
    createHandler(f.runtime, { secret, enabled: false })
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/rpc`;
  const body = JSON.stringify({ userId: "user-a", operation: "login" });
  assert.equal((await fetch(url, { method: "POST", body })).status, 401);
  assert.equal(
    (
      await fetch(url, {
        method: "POST",
        body,
        headers: { authorization: `Bearer ${secret}` },
      })
    ).status,
    503
  );
  assert.equal(f.processes.length, 0);
});

test("exhausted allowance pauses admission without starting a turn, and recovers after reset", async (t) => {
  const f = await fixture(t);
  const c = await f.connect();
  const rpc = f.processes[0];
  const original = rpc.call.bind(rpc);
  rpc.call = async (method, params) =>
    method === "account/rateLimits/read"
      ? { rateLimits: { primary: { usedPercent: 100, resetsAt: 10 } } }
      : original(method, params);
  await assert.rejects(f.runtime.submit(f.input(c)), ERROR_PATTERN_12);
  assert.equal(
    rpc.calls.filter((call) => call.method === "turn/start").length,
    0
  );
  f.advance(10_000);
  assert.equal((await f.runtime.submit(f.input(c))).state, "running");
});

test("store excludes a second writer and idle processes release capacity", async (t) => {
  const f = await fixture(t);
  await f.connect();
  assert.throws(() => new Store(join(f.root, "state.sqlite")), ERROR_PATTERN_4);
  f.advance(300_001);
  await f.runtime.sweep();
  assert.equal(f.runtime.processes.size, 0);
  assert.equal(f.processes[0].closed, true);
  assert.equal((await f.runtime.status("user-a")).state, "connected");
});

test("runtime selection is explicit and interrupts preserve a durable cancellation", async (t) => {
  const f = await fixture(t);
  const c = await f.connect();
  await f.runtime.selectRuntime("user-a", false);
  await assert.rejects(f.runtime.submit(f.input(c)), ERROR_PATTERN_0);
  await f.runtime.selectRuntime("user-a", true);
  const next = f.runtime.connection(f.runtime.owner("user-a"));
  const job = await f.runtime.submit(f.input(next));
  await f.runtime.interrupt("user-a", job.id, "workspace-a:chat-1");
  assert.equal((await f.runtime.submit(f.input(next))).state, "cancelled");
  assert.equal(
    f.processes[0].calls.filter((call) => call.method === "turn/start").length,
    1
  );
});

test("unconnected selection stays stable and abandoned device logins release their process", async (t) => {
  const f = await fixture(t);
  const owner = f.runtime.owner("user-a");
  assert.equal(
    f.runtime.connection(owner).generation,
    f.runtime.connection(owner).generation
  );
  assert.equal(f.runtime.connection(owner).generation, "default");
  await f.runtime.login("user-a");
  f.advance(600_001);
  await f.runtime.sweep();
  assert.equal(f.runtime.connection(owner).state, "expired");
  assert.equal(f.runtime.processes.size, 0);
});

test("expired durable results report expiry and never replay the original task", async (t) => {
  const f = await fixture(t);
  const c = await f.connect();
  const job = await f.runtime.submit(f.input(c));
  await f.runtime.interrupt("user-a", job.id, "workspace-a:chat-1");
  f.advance(24 * 60 * 60_000 + 1);
  await f.runtime.sweep();
  const old = await f.runtime.submit(f.input(c));
  assert.equal(old.state, "cancelled");
  assert.ok(old.events[0].response.text.includes("stored result expired"));
  assert.equal(
    f.processes[0].calls.filter((call) => call.method === "turn/start").length,
    1
  );
});

test("restart after an approval claim cannot execute or report that action again", async (t) => {
  const f = await fixture(t);
  const c = await f.connect();
  const input = f.input(c);
  const job = await f.runtime.submit(input);
  await f.runtime.request(f.runtime.owner("user-a"), f.processes[0], {
    id: 12,
    method: "item/tool/call",
    params: {
      threadId: f.store.job(job.id).threadId,
      tool: "content_propose_action",
      arguments: {
        kind: "publish",
        workspaceId: "workspace-a",
        postId: "post",
      },
    },
  });
  const actionId = f.runtime.poll("user-a", job.id, input.scope).events[0]
    .response.actions[0].id;
  f.runtime.claimAction("user-a", job.id, input.scope, actionId, "approved");
  const restarted = new Runtime({
    store: f.store,
    root: f.root,
    processFactory: async () => {
      throw new Error("Must not replay");
    },
  });
  assert.throws(
    () =>
      restarted.claimAction(
        "user-a",
        job.id,
        input.scope,
        actionId,
        "approved"
      ),
    ERROR_PATTERN_2
  );
  restarted.resolveAction("user-a", job.id, input.scope, actionId, {
    ok: true,
  });
  const outcome = await restarted.submit(input);
  assert.equal(outcome.state, "failed");
  assert.ok(outcome.events.at(-1).response.text.includes("not repeated"));
  assert.equal(f.processes[0].replies.length, 0);
});
