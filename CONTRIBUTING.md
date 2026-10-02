# Contributing to Delulu

Thanks for helping make agent-operated social publishing safer and more useful.

## Before opening a change

- Search existing issues and pull requests.
- Open an issue before large behavioral, schema, provider, or deployment work.
- Never include credentials, exported customer data, or real social tokens.
- Keep hosted and self-hosted behavior explicit in code and tests.

## Development setup

```bash
corepack enable
pnpm install
pnpm pg:up
pnpm pg:migrate
pnpm dev:app+api
```

Copy only the environment examples needed by the surfaces you are running. Use
test applications and accounts for provider work.

## Pull requests

1. Create a focused branch from `main`.
2. Add behavior-level tests for public contracts, permissions, publishing state,
   migrations, or deployment changes.
3. Run the focused package tests while working.
4. Before requesting review, run:

```bash
pnpm check
pnpm typecheck
pnpm test
```

Database changes must add an append-only migration and pass
`pnpm pg:migration-lint`. Never edit an already-released migration.

Provider changes must preserve idempotency, token encryption, retry
classification, and target-level failure reporting.

## Documentation

Update the README or `apps/docs/content/docs` whenever a public command,
contract, configuration value, deployment step, or limitation changes.

## Licensing

By contributing, you agree that your contribution is licensed under the
repository's AGPL-3.0-only license.

## Product code organization

The authenticated app uses three layers:

- `apps/app/app`: Next.js routes and server entrypoints. Keep route files thin.
- `apps/app/features`: dashboard, publishing, connections, analytics, automations,
  agent, workspace, billing, and onboarding. Keep feature components, hooks,
  helpers, and tests together. Publishing owns the editor, calendar, posts,
  bulk upload, and draft store.
- `apps/app/shell`: navigation, authentication integration, providers, and resource
  lifecycle. `shared` contains API view types used across features.

Publishing schemas and platform defaults live in `@delulu/core/publishing/*`.
The design system contains UI providers only; each application composes its own
AuthProvider and AnalyticsProvider. Declare these dependencies in the consuming
app rather than depending on transitive imports.

Resources share one request/cache entry per query key. A key must contain the
workspace and every parameter that changes the response. Observers can select
freshness independently; shared retry settings use the largest requested retry
count and delay for subsequent fetches. Use `suspense: false` for independent
panel reads so they start together. Failures still reach ResourceBoundary unless
`throwOnError: false` is explicitly requested for an inline error state.

Compact product density is enabled by `data-density="compact"` on the body, so
portalled controls receive the same sizing. Use shared Button sizes rather than
local height overrides. `data-texture="dither"` enables static Dither Kit-derived
Bayer textures. Chart patterns retain Recharts interactions and expose an exact
value table; they do not add a second canvas engine or animation loop.

## Local navigation and visual checks

```bash
pnpm --filter app dev:fixtures
```

Open `http://localhost:4173`. This Vite-only harness mounts the real app shell,
resource layer, typed HTTP client, and dashboard/posts/calendar/analytics views.
It aliases authentication, navigation, and telemetry only in its own build and
returns deterministic API responses with 150ms latency. No fixture modules are
imported by production routes, and no production authentication bypass exists.
The fixture navigation adapter does not model Next.js server routing or RSC
network costs.

To record ten repeated runs with a 4× CPU slowdown, open the harness with
agent-browser and pass its CDP endpoint to the benchmark runner:

```bash
agent-browser --session delulu-perf open http://localhost:4173
agent-browser --session delulu-perf get cdp-url
node apps/app/testing/browser/benchmark.mjs <cdp-websocket> http://localhost:4173 .context/performance.json
```

Keep the browser viewport and host load identical between revisions. Do not edit
source files or run builds during recording. The runner records fresh app-state
startup, navigation, cached return, API reads, long tasks, and loaded development
JavaScript. These are frontend fixture measurements, not production Web Vitals
or production bundle sizes. Validate real authentication, API latency, and
publishing against a configured test instance before release.

Product navigation uses `AppLink` and `useAppRouter` from `shell/navigation` to
show immediate route-loading feedback while preserving the shell. The authenticated
`loading.tsx` also gives Next.js a partial-prefetch boundary. Use local resource
boundaries for secondary controls such as connection dialogs so they cannot block
otherwise-ready page content.

After a successful post write, `cacheSavedPost` seeds the server-confirmed record
before navigation and refreshes the full list in the background. Resource reads,
including callback reconciliation, must go through the resource registry to share
in-flight work. Mutations already invalidate their resource domain; add explicit
invalidations only for other affected domains. Background read failures preserve
cached content, but authorization failures do not expose it. Processing-list polling
runs only while mounted and visible.

## Browser and feature verification

See [Local verification](docs/TESTING.md) for the deterministic browser harness,
Postgres integration checks, failure traces, and repository-local pstack
verification skills. Run `pnpm verify:browser` for app/shared UI changes and add
acceptance assertions for new behavior.
