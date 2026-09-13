import { createRequire } from "node:module";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { Miniflare } = createRequire(require.resolve("wrangler/package.json"))(
  "miniflare"
);

it("persists service-binding callbacks without treating them as transient RPC stubs", async () => {
  const mf = new Miniflare({
    modules: true,
    compatibilityDate: "2026-06-01",
    compatibilityFlags: ["allow_irrevocable_stub_storage"],
    durableObjects: { STORAGE: { className: "Storage", useSQLite: true } },
    script: `
      import { DurableObject, WorkerEntrypoint, RpcStub } from "cloudflare:workers";
      export class Callback extends WorkerEntrypoint {
        async reply() { return this.ctx.props.message; }
      }
      export class Storage extends DurableObject {
        async save(target, broken) {
          const retained = broken ? target.dup() : target instanceof RpcStub ? target.dup() : target;
          await this.ctx.storage.put("target", retained);
        }
        async reply() { return (await this.ctx.storage.get("target")).reply(); }
      }
      export default {
        async fetch(request, env, ctx) {
          const store = env.STORAGE.getByName("test");
          const target = ctx.exports.Callback({props: {message: "persisted"}});
          try {
            await store.save(target, new URL(request.url).pathname === "/broken");
            return new Response(await store.reply());
          } catch(error) { return new Response(error.name + ": " + error.message, {status:500}); }
        }
      }`,
  });
  try {
    const broken = await mf.dispatchFetch("https://example.test/broken");
    expect(broken.status).toBe(500);
    expect(await broken.text()).toContain("RpcPromise");
    const fixed = await mf.dispatchFetch("https://example.test/fixed");
    expect(fixed.status).toBe(200);
    expect(await fixed.text()).toBe("persisted");
  } finally {
    await mf.dispose();
  }
});
