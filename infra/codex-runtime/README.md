# ChatGPT runtime for Delulu

Optional Linux service for the Telegram agent. Cloudflare remains the API,
webhook and Durable Object host; Clerk remains Delulu authentication. The existing
Cloudflare OS runtime is unchanged. This adapter uses Codex app-server 0.159.3
(JSON-RPC over stdio), not a new Vercel AI SDK provider.

## Local start

Requires Docker Compose, or Node **24.14.1+** with the pinned Codex binary.
From this directory:

```sh
# Generate a service secret; save it in your local secret manager.
openssl rand -hex 32
# Export CODEX_RUNTIME_SECRET with that value in this terminal.
export CODEX_RUNTIME_ENABLED=true
docker compose up --build -d
curl http://127.0.0.1:8788/health
```

The Compose port binds only to localhost. The named `codex-data` volume must
persist across restarts. Do not remove it during upgrades. For a native local run:

```sh
npm ci
export PATH="$PWD/node_modules/.bin:$PATH"
export CODEX_RUNTIME_DATA="$PWD/.data"
npm start
```

Set these on the **Delulu API** as well, using the same secret:

```dotenv
CODEX_RUNTIME_ENABLED=true
CODEX_RUNTIME_URL=http://127.0.0.1:8788
CODEX_RUNTIME_SECRET=<your generated secret>
```

Use the normal local API, Clerk and Telegram linking setup documented in
`apps/api/ENVIRONMENTS.md`. Invite the test user to the existing agent beta.
Open `/agent/settings`, choose **Connect ChatGPT**, visit the displayed OpenAI
URL and enter the code. Enable device-code authorization in ChatGPT security
settings if prompted. Delulu never asks for a password or token. Confirm Telegram
account linking separately. The next message uses a fresh Codex conversation;
existing Delulu memory and enabled instruction skills are included.

## Deployment contract

This change does not provision infrastructure or enable production. A Cloudflare
Worker cannot reach your laptop's localhost. Deploy the runner on a Linux host,
put authenticated HTTPS ingress in front of it, and set its reachable HTTPS URL
on the API. The service bearer secret is server-to-server only: never put it in
`NEXT_PUBLIC_*`, browser configuration, Telegram or model prompts. The only HTTP
exception is localhost or the `codex-runtime` Compose hostname.

Run **one service instance per persistent volume**. A SQLite exclusive lock
rejects a second writer; WAL plus FULL synchronization journals task admission,
thread mappings, connection ownership, approvals and results. Use local durable
storage, not a shared network filesystem. Back up the encrypted host/volume as
sensitive data: it contains authentication, conversation history and task data.
Run as the supplied non-root user. Keep the port private behind ingress. TLS,
secret distribution, volume encryption, monitoring, backups and host maintenance
are deployment responsibilities.

Both API and runner require `CODEX_RUNTIME_ENABLED=true`. Set the API flag false
first to stop admission immediately; active tasks are interrupted on the next
Durable Object poll. Cleanup endpoints remain available. Restarting the runner
with the flag false fails unfinished tasks without replay. Keep its URL and secret
configured for disconnect/cleanup and persisted selection checks. Do not delete
configuration to disable it: that would discard the ability to distinguish users
who selected their subscription.

## Behavior and boundaries

- One ChatGPT connection per Delulu user, never per workspace. Trusted Clerk or
  Telegram-linked identity determines ownership. Workspace membership and channel
  grants are rechecked by the existing content bridge before any content action.
- Each user gets a separate process, private auth directory and restricted work
  directory. The child inherits no API/service secrets. Credential storage sits
  outside the model's readable roots; shell, browser, plugins, MCP and image tools
  are unavailable. Only scoped content context and approval tools are exposed.
- One active task per user; up to 16 live processes per runner. Idle connected
  processes close after five minutes. Tasks time out after 20 minutes; approvals
  after 10. Device requests expire locally after 10 minutes or runner restart.
- Content writes use the existing approval buttons and Postgres execution receipts.
  A claimed approval cannot be claimed again. Uncertain actions are never retried
  automatically. Reconcile the actual workspace before issuing another action.
- Jobs survive polling interruptions. Runner restart terminates unfinished work
  with an explicit failure; it never resumes an uncertain turn. Final events are
  retained for 24 hours, then compacted to deduplication tombstones. SQLite thread
  mappings and Codex conversation history remain until operator retention cleanup.
- If the configured runner is unavailable, new Telegram admission pauses because
  runtime selection cannot be verified. It never guesses that paid fallback is safe.
- Model choices and usage windows come from Codex. Missing limit information stays
  unavailable, not guessed. Known exhaustion blocks admission; provider errors
  fail the turn. There is no automatic paid API fallback. Subscription cost is
  recorded as zero API cost, with no fabricated token counts.
- Disconnect durably blocks new work before logout, terminates active work and
  removes auth.json. It preserves runtime selection so later messages cannot
  silently incur API charges. “Use Delulu runtime instead” is an explicit choice.
  An action already submitted before disconnect may still finish.
- Runtime/model changes start a new Telegram chat. Old Cloudflare histories stay
  stored. This release supports **text Telegram messages only** for Codex; web-agent
  runtime selection, video generation, arbitrary execution and media preprocessing
  are outside scope. The work directory is not a general-purpose user filesystem.

Device authentication uses the documented Codex mechanism. It does not by itself
establish OpenAI approval for hosted commercial use or guarantee future availability.

## Verification

```sh
npm ci --prefix infra/codex-runtime # from repository root
node --test infra/codex-runtime/test/*.test.mjs
pnpm --filter @delulu/http-api typecheck
pnpm --filter app typecheck
pnpm verify:browser
```

Follow `docs/TESTING.md` for the disposable Postgres suites and boundary checks.
Most runner tests use a fake app-server with real SQLite; one smoke test starts
the pinned binary in a fresh private home and reads its unauthenticated account
status, without login or inference. Telegram integration tests
use real Postgres and mocked provider transport; browser tests use the real
settings component with fixture API/auth. None proves live ChatGPT sign-in,
subscription inference, real Telegram delivery, or publishing. A live acceptance
run should connect two separate test users, complete one text turn each, verify
workspace isolation and approval/cancellation, restart the service mid-turn, and
disconnect. Do not use real publishing as a smoke test.

Protocol references: [Codex app-server](https://developers.openai.com/codex/app-server/)
and [Codex authentication](https://developers.openai.com/codex/auth/).
