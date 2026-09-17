# Delulu Agent Runtime

This directory owns the separately deployed Content HQ runtime. It is intentionally outside the root pnpm workspace and requires Node 24 plus pnpm 11.

The agent SQL migrations follow main's scheduler cutover: `0016` through `0025`. Main's `0014` execution receipts and `0015` queue retirement remain unchanged, including their guarded transfer requirements. The legacy data importer intentionally stays pinned to schema `0013`. Agent expiry recovery uses its own maintenance lease; publishing and lifecycle execution remain owned by `JobExecutor`.

The upstream source is a git submodule pinned to one reviewed revision. Delulu-specific trusted RPC methods are kept in `patches/` and are applied only to `.build/cloudflare-os`; the submodule must remain clean. This makes every upgrade a visible source and trust-boundary review.

## Prepare and verify

```sh
git submodule update --init infra/agent-runtime/upstream
cd infra/agent-runtime
corepack enable
pnpm check
pnpm prepare
pnpm install:runtime
pnpm build
```

Copy `deployment.example.json` to the ignored `deployment.json` and fill the Cloudflare account and Worker names. Create the named AI Gateway with platform provider credentials, then put an API token with AI Gateway Run and Workers AI Run permissions on the Workshop Worker:

```sh
cd .build/cloudflare-os/packages/workshop-backend
corepack pnpm exec wrangler secret put CF_AI_GATEWAY_API_TOKEN \
  --name delulu-agent-runtime
```

Keep the token in the runtime Worker only; it must never be placed in a user workspace or the Delulu API Worker. Run `pnpm deploy -- --dry-run` to build and validate every generated Worker configuration before `pnpm deploy` performs the real deployment.

External turns are capped at four model steps, a 32k-token input window, and 4k output tokens per step. The authenticated workspace API reserves $0.50 of internal budget before dispatch and reconciles reported usage afterward. This is separate from the direct channel pilot: its admission is count-based, not dollar-based metering. Telegram permits only `TELEGRAM_ALLOWED_USER_ID`, with `TELEGRAM_MONTHLY_TURN_LIMIT` turns per UTC month (1,000 in staging; missing/invalid values default to ten). Reservations and message deduplication are atomic in the conversation; failed runs still count. Exhaustion sends a durable notice without inference. The retired lifetime admission object remains for storage compatibility but is no longer called. WhatsApp retains its ten-turn monthly allowance.

The legacy pilot routes a bot/user pair to one persistent chat. The account-linked beta uses a separate Durable Object namespace and versioned workspace chats: `/new` changes the session without deleting memory. Idle time does not reset either mode.

## Account-linked Telegram beta (gated)

`TELEGRAM_ACCOUNT_LINKING_ENABLED` is enabled only in staging for invited-account acceptance testing. Production remains disabled. Unlinked users receive a Clerk-backed connection link, then must confirm the account in their originating private Telegram chat. Challenges are hashed, single-use, and expire after ten minutes. Numeric Telegram IDs establish identity; guest conversations are never imported.

The implementation includes workspace switching, new chats, cancellation, action buttons, instruction-skill management, confirmed memory context, incoming media processing, and authenticated link-management APIs. The content connector obtains workspace scope from the trusted runtime rather than the prompt. Channel grants are checked again for content access and writes. Disconnect revokes the account link before asynchronous cancellation recovery.

Channel messages, challenges, operational receipts, and reply recovery stay in Durable Objects. Migration `0026_agent_channel_identity.sql` adds account links, beta invitations, versioned skills, content-free turn reservations, and personal/workspace memory scope. Apply it only to the intended database using the normal migration workflow.

Before enabling staging, configure an isolated Postgres database (`DATABASE_URL` or `HYPERDRIVE`), Clerk test instance (`CLERK_ISSUER`, `CLERK_JWT_KEY`, `CLERK_SECRET_KEY`), authenticated staging web origin (`APP_BASE_URL` and web build-time `NEXT_PUBLIC_API_URL`), private R2 storage credentials/bucket, and the `AGENT_MEDIA_AI` Workers AI binding. The database-less guest pilot is not sufficient. Do not reuse production data or authentication configuration.

Deploy from the repository root. Set `STAGING_CLERK_PUBLISHABLE_KEY` and `STAGING_CLERK_SECRET_KEY` in your local environment from the Clerk **test** instance first; never commit them. The web build requires these values as well as the deployed Worker secrets. Always rebuild before deploying so browser code cannot retain a production API origin:

```sh
NEXT_PUBLIC_API_URL=https://delulu-staging.whizzy.workers.dev \
NEXT_PUBLIC_APP_URL=https://staging.delulu.social \
NEXT_PUBLIC_ANALYTICS_DISABLED=true \
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="${STAGING_CLERK_PUBLISHABLE_KEY:?Set the test publishable key}" \
CLERK_SECRET_KEY="${STAGING_CLERK_SECRET_KEY:?Set the test secret key}" \
pnpm --filter app exec opennextjs-cloudflare build --env staging
pnpm --filter app exec opennextjs-cloudflare deploy --env staging
pnpm --filter @delulu/http-api run deploy:staging
```

API deployment must use `wrangler deploy`, not a versions-only upload, when applying a new Durable Object migration. Staging has its own `JobExecutor` for approved scheduled actions. Provider OAuth credentials and redirect registrations must also be configured for staging before connecting real social accounts; production connections are not available here.

Public rollout blockers still outstanding: strict dollar admission at every model/media invocation (the current $0.25 reservation is not a hard per-call spending cap), outbound generated-file delivery, bounded active-receipt indexing/retention, and live end-to-end acceptance including web authentication and one approved test action. Staging invitations are an explicit testing grant, not a production-readiness guarantee.

## Staging pilot boundaries

Staging uses `delulu-staging` for the API and `delulu-web-staging` for authenticated onboarding. Both are environments of the normal applications, not separate implementations. Hyperdrive `delulu-staging-db` connects to the dedicated `delulu_staging` database, with caching disabled. Assets use the private `delulu-staging-assets` bucket and cache namespaces are isolated from production. Clerk uses a test instance. Telegram account access requires an active database beta invitation; the legacy single-user allowlist applies only when account linking is disabled.

WhatsApp is disabled in staging. Both transports persist their inbox/outbox in Durable Objects, not Postgres, and retain message IDs for deduplication after clearing terminal delivery payloads. Provider rate-limit deadlines survive restarts and new incoming events.

Successful channel replies verify transport and inference only. Verified account linking, user-facing transcript exports, canonical memory extraction, media ingress, and production ritual delivery still require end-to-end acceptance. Staging starts with an empty, independently migrated content database; production accounts and content are not copied. Unknown or expired external-effect execution outcomes require reconciliation; never retry them merely because a lease is old.

The Workshop Worker exposes `ExternalMessageGateway` to the Delulu API only through a service binding with `{ "source": "delulu" }` props. Bind the API Worker back to itself as `AGENT_RUNTIME_BRIDGE` with entrypoint `AgentRuntimeBridge` so persistent response targets survive Worker restarts. After the runtime exists, redeploy `apps/api` so its `AGENT_RUNTIME` binding resolves.

External channels are optional Delulu-owned adapters. They authenticate provider
events, resolve the Delulu user and workspace, normalize the message, and submit
it through the runtime's trusted service-binding gateway. The runtime itself
does not provide turnkey bidirectional messaging connectors.

The ordinary Delulu Worker contains no machine-provider SDK or secret. A full Linux runner is an independently deployed, default-disabled administrative fallback.

## Upgrade rule

Never float or automatically update the submodule. To upgrade: change the pin, review the full upstream diff, rebase the patch, run the upstream suite plus Delulu contract/isolation tests, canary the runtime, and only then promote it. Reverting the runtime deployment or disabling the workspace flag is the rollback path.
