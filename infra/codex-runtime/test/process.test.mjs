import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { CodexProcess } from "../src/process.mjs";

test("pinned app-server initializes with a private credential home", async () => {
  const root = await mkdtemp(join(tmpdir(), "delulu-codex-protocol-"));
  let rpc;
  try {
    rpc = await CodexProcess.start({
      root,
      executable: fileURLToPath(
        new URL("../node_modules/.bin/codex", import.meta.url)
      ),
    });
    const account = await rpc.call("account/read", { refreshToken: false });
    assert.equal(account.account, null);
    assert.equal(account.requiresOpenaiAuth, true);
    assert.equal(rpc.cwd, join(root, "work"));
    // biome-ignore lint/suspicious/noBitwiseOperators: isolate Unix permission bits.
    assert.equal((await stat(join(root, "auth"))).mode & 0o777, 0o700);
    assert.equal(
      // biome-ignore lint/suspicious/noBitwiseOperators: isolate Unix permission bits.
      (await stat(join(root, "auth", "config.toml"))).mode & 0o777,
      0o600
    );
  } finally {
    await rpc?.close();
    await rm(root, { recursive: true, force: true });
  }
});
