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

Telegram currently routes every message from the same bot/user pair to the same persistent runtime chat. Idle time and Worker restarts do not create new sessions; there is no `/new` command yet. Changing session routing must preserve the workspace and handle pending callbacks explicitly.

## Staging pilot boundaries

Telegram currently supports private text messages under an isolated guest runtime identity. It does not link that identity to a verified Delulu account. WhatsApp uses an explicitly configured test sender and is disabled in the staging configuration. Both transports persist their inbox/outbox in Durable Objects, not Postgres, and retain message IDs for deduplication after clearing terminal delivery payloads. Provider rate-limit deadlines survive restarts and new incoming events.

Successful channel replies verify transport and inference only. Verified account linking, user-facing transcript exports, canonical memory extraction, media ingress, and production ritual delivery still require end-to-end acceptance. The staging API has no production database bindings, so it cannot provide canonical content capabilities. Unknown or expired external-effect execution outcomes require reconciliation; never retry them merely because a lease is old.

The Workshop Worker exposes `ExternalMessageGateway` to the Delulu API only through a service binding with `{ "source": "delulu" }` props. Bind the API Worker back to itself as `AGENT_RUNTIME_BRIDGE` with entrypoint `AgentRuntimeBridge` so persistent response targets survive Worker restarts. After the runtime exists, redeploy `apps/api` so its `AGENT_RUNTIME` binding resolves.

External channels are optional Delulu-owned adapters. They authenticate provider
events, resolve the Delulu user and workspace, normalize the message, and submit
it through the runtime's trusted service-binding gateway. The runtime itself
does not provide turnkey bidirectional messaging connectors.

The ordinary Delulu Worker contains no machine-provider SDK or secret. A full Linux runner is an independently deployed, default-disabled administrative fallback.

## Upgrade rule

Never float or automatically update the submodule. To upgrade: change the pin, review the full upstream diff, rebase the patch, run the upstream suite plus Delulu contract/isolation tests, canary the runtime, and only then promote it. Reverting the runtime deployment or disabling the workspace flag is the rollback path.
