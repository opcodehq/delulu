# Local verification — 2026-10-03

Implementation remains opt-in; no production configuration, deployment, push or
real publishing was performed.

| Check | Result |
| --- | --- |
| Runner `node --test infra/codex-runtime/test/*.test.mjs` | 15 passed |
| Services unit tests | 60 passed |
| API unit tests | 100 passed |
| App unit tests | 136 passed |
| Disposable Postgres integration: database / services / API / worker / migration | 3 / 40 / 34 / 7 / 5 passed |
| Browser `pnpm verify:browser` using installed Chrome | 32 passed; 2 existing navigation tests skipped |
| API, app and services typechecks | Passed |
| Changed-file non-mutating Biome check and `git diff --check` | Passed |
| Connections boundary, backend cutover and icon boundary | Passed |
| Scoped axe accessibility check on agent settings | 0 violations; keyboard activation and mobile dark layout inspected |

Local integration used disposable PostgreSQL 16 on port 55432 with all 26
migrations applied. CI retains its existing PostgreSQL 18 integration setup.
Runner tests and its dependency install have a separate Node 24.14.1 CI job.

## Acceptance evidence

Runner coverage includes successful, declined, cancelled, expired and interrupted
login; owner/workspace isolation; serialized refresh; model rejection; exhaustion;
disconnect during a turn with authentication-file deletion; durable delivery;
duplicate submissions; action claims; restart after a claim; no automatic replay;
explicit runtime switching; abandoned-login process cleanup; single-writer locking;
and result expiry. One test starts the real pinned Codex binary, reads its empty
account status and checks private directory/config permissions. The other runner
tests replace app-server transport while using real SQLite.

Telegram integration uses real Postgres with mocked Telegram/runner transports.
It checks trusted ownership, replies, duplicate messages, new chats, cancellation,
approved memory execution through the content bridge, its execution receipt and
repeated approval buttons. API integration checks unauthenticated denial, beta
eligibility for connecting, and disabled-runtime responses. Subscription-funded
admission reserves zero API spend in the real Postgres ledger and remains available
when the separate API-spend allowance has been exhausted.

Browser tests exercise the actual settings page/component with fixture API and
authentication, on desktop and mobile dark mode: connect/code/completion, model
selection, explicit switch back to Delulu, disconnect, cancellation, expiry,
disabled state, failure/retry, and touch targets. They do not validate Clerk/Next
server authentication or real provider callbacks. No external provider requests
are made by these browser tests.

Logs and screenshots in the ignored `.context/` directory:

- `codex-runner-test.log`, `codex-services-test.log`, `codex-api-test.log`, `codex-app-test.log`
- `codex-integration.log`, `codex-api-integration.log`, `codex-services-integration.log`
- `codex-browser-final.log`, `codex-lint-final.log`, `codex-*-typecheck.log`
- `chatgpt-connected.png`, `chatgpt-mobile.png` (fixture accounts)

## Still unverified

Live OpenAI device authorization, subscription inference, actual Telegram delivery,
real publishing, and a production Next/Clerk session were not exercised. Docker
was unavailable; the image was not built here. Native Node execution with the
pinned Codex binary was exercised. Infrastructure provisioning, authenticated TLS
ingress, secret installation, host/volume protections, and production rollout
remain deployment work. The protocol smoke test does not prove model execution
or every sandbox boundary under adversarial inference.
