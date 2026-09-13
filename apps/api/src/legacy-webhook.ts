interface Env {
  STAGING: { fetch(request: Request): Promise<Response> };
}

// Keep existing provider subscriptions working during the hostname cutover.
export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return env.STAGING.fetch(request);
  },
};
