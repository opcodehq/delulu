import assert from "node:assert/strict";
import { test } from "node:test";
import { check, PINNED_REVISION } from "./runtime.mjs";

const GIT_REVISION = /^[a-f0-9]{40}$/;

test("runtime is pinned and the reviewed patch applies cleanly", () => {
  assert.match(PINNED_REVISION, GIT_REVISION);
  assert.doesNotThrow(() => check());
});
