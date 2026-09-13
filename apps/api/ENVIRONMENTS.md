# API environments

Production and staging deploy the same `src/index.ts` from this package.
The default Wrangler configuration targets `delulu-api-next`; `--env staging`
targets `delulu-staging`. Never create a second application for an environment.

```sh
pnpm --filter @delulu/http-api run deploy:staging
pnpm --filter @delulu/http-api exec wrangler secret put WHATSAPP_APP_SECRET --env staging
pnpm --filter @delulu/http-api run deploy
```

Staging secrets remain on the existing Worker. Its WhatsApp callback stays at
`https://delulu-staging.whizzy.workers.dev/v1/providers/whatsapp/webhook`.
`wrangler.legacy.toml` is only a temporary hostname forwarding shim, not another
implementation. Remove it after Meta no longer uses the old callback hostname.

Staging currently has no database, billing, email, or social-publishing
credentials. Do not reuse production Hyperdrive or KV IDs to make tests pass.
Database-backed routes need dedicated staging account/config storage and auth
configuration; webhook messages must use the planned durable ingress instead.
The shared WhatsApp POST route returns 503 until that ingress is implemented.
Use `/live` for process liveness; `/health` retains the existing database
readiness probe and response contract in both environments.
