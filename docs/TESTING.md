# Local verification

New behavior needs explicit acceptance tests. CI automatically runs committed
checks on pull requests and pushes to main; it cannot infer whether an untested
new feature is correct. No staging credentials are needed for this workflow.
Staging and real OAuth/publishing checks run only when requested.

## Setup and commands

Use Node >=22.12 and pnpm 10.8.0 from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter app exec playwright install --with-deps chromium
pnpm --filter app test
pnpm --filter app typecheck
pnpm verify:browser
```

The browser command builds and owns a fixture preview on **127.0.0.1:4180**;
keep that port free. Each test gets a new browser context. Chromium is pinned
through the Playwright lockfile. On a machine with Chrome already installed,
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome pnpm verify:browser`
is available; CI uses Playwright's pinned browser instead.

For the broader repository checks:

```sh
pnpm test
pnpm typecheck
pnpm check:connections-boundary
pnpm check:backend-cutover
pnpm icons:check
pnpm check
```

`pnpm check` is non-mutating. `pnpm lint` and `pnpm format` modify files.
Report existing unrelated failures separately; do not treat them as passed.

## Coverage layers

| Layer | Where | What it verifies |
| --- | --- | --- |
| Unit/component | Feature-local `*.test.ts(x)` | Domain behavior, cache races, session isolation, OAuth reconciliation, mutations and validation |
| Browser | `apps/app/testing/browser/tests/*.browser.ts` | Real shell/pages/resource layer, navigation, cached return, errors/retry, loading, workspace selection/races, mobile viewport and reduced-motion loader |
| Database/API/worker | Existing package `test:integration` scripts | Real Postgres, service contracts, permissions and publishing jobs |
| Production build | Existing deployment/build checks | Next.js/server integration; separate from the fixture harness |

Browser fixtures replace authentication, Next navigation and API transport only
inside the Vite harness. Production app entrypoints never import test auth.
This suite does **not** prove Clerk middleware, Next RSC navigation, provider
callbacks or actual publishing work end-to-end. Unit tests cover deeper cache
and callback scenarios; extend browser fixtures with realistic populated data
when changing those screens.

Fixtures reject unhandled endpoints rather than silently returning empty data.
Use `page.addInitScript` to configure `window.fixtureConfig` before a page opens:
`latency` in milliseconds and `failures` mapping path suffixes to failure counts.
Tests assert no unhandled endpoints or simultaneous identical reads. Outbound
browser requests are blocked; tests cannot contact real providers. Use locators
and observable state, not fixed sleeps. `.browser.ts` keeps Playwright tests out
of Vitest discovery. No automatic retries mask flaky failures.

## Disposable database integration

Use a disposable local database, never production. The CI `postgres-integration`
job starts Postgres 18, migrates it and runs all five integration suites. Locally,
use `pnpm pg:up` with Docker and the database package's documented local env:

```sh
pnpm pg:migrate
pnpm --filter=@delulu/db test:integration
pnpm --filter=@delulu/services test:integration
pnpm --filter=@delulu/http-api test:integration
pnpm --filter=@delulu/worker test:integration
pnpm --filter=@delulu/migrate-convex test:integration
```

The local compose defaults are `DATABASE_URL=postgres://delulu:delulu@localhost:5432/delulu`
and a local-only `ENCRYPTION_SECRET`. See `apps/api/ENVIRONMENTS.md` for API configuration.
If Docker/Postgres is unavailable, report that limitation; fixture tests are not
a replacement for this layer.

## Evidence and performance

Open the local HTML report with
`pnpm --filter app exec playwright show-report .cache/browser-report`.
Failed tests retain screenshots and traces under `apps/app/.cache/browser-results`.
CI uploads both directories as `browser-verification` for 14 days, even on failure.
For exploratory screenshots and baseline reports use gitignored `.context/`.

For pstack-style performance comparison, run `pnpm --filter app build:fixtures`
then `pnpm --filter app preview:fixtures`. Open `http://127.0.0.1:4180` using
`agent-browser`, obtain `agent-browser get cdp-url`, then run:

```sh
node apps/app/testing/browser/benchmark.mjs '<CDP websocket>' http://127.0.0.1:4180 .context/navigation.json
```

Compare ten runs at identical latency (default 150ms), 4x CPU, viewport, browser
and build mode. The report records the actual build mode. Preserve raw timing/request,
long-task and resource measurements. Fixture timings measure frontend work,
not real API/database latency. Do not enforce workstation timing numbers as
universal CI thresholds.

## Agent verification skills

- `delulu-verify`: acceptance-test matrix, affected automated checks and pstack
  QA's reproduce/evidence/fix/retest workflow.
- `delulu-performance`: controlled pstack-style before/after measurements.

Both are repository-local in `.agents/skills/`. They guide agents to write and
run verification; executable Playwright/Vitest checks enforce results in CI.
Neither skill authorizes staging, publishing, merging or deployment.
