declare module "cloudflare:workers" {
  export abstract class DurableObject<Env = unknown> {
    protected readonly env: Env;
    protected readonly ctx: import("@cloudflare/workers-types").DurableObjectState;
    constructor(ctx: unknown, env: Env);
  }
  export abstract class WorkerEntrypoint<Env = unknown, Props = object> {
    protected readonly env: Env;
    protected readonly ctx: {
      readonly props: Props;
      readonly exports: unknown;
      waitUntil(promise: Promise<unknown>): void;
    };

    constructor(ctx: unknown, env: Env);
  }
}
