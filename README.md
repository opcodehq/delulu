# Delulu

Open-source social scheduling infrastructure for AI agents.

Delulu gives people and agents one permission-aware system for preparing media,
drafting, scheduling, publishing, reviewing, and inspecting social content across
Instagram, Facebook, X, LinkedIn, TikTok, Pinterest, Threads, YouTube, Bluesky,
and Farcaster.

[Documentation](https://docs.delulu.social) ·
[Agent setup](https://docs.delulu.social/getting-started/agent-setup/) ·
[Hosted app](https://solulu.delulu.social) ·
[Self-hosting](https://docs.delulu.social/self-hosting/)

## Why Delulu

- **Agent-native interfaces:** hosted MCP, a deterministic CLI with a packaged
  agent skill, and a typed REST API.
- **Human control:** delegated OAuth scopes, live workspace roles, optional post
  reviews, and revocable credentials.
- **Reliable publishing:** explicit draft/schedule/publish intent, durable
  operation identity, target-level results, retries, and partial-failure states.
- **Complete workflow:** media preparation, multi-network publishing, analytics,
  collaboration, and programmable automations.
- **Open source:** AGPL-3.0 licensed, with a supported Docker Compose deployment.

## Set up with one prompt

With Node.js 20 or newer installed, add the Delulu skill globally for your
detected AI agents:

```bash
npx skills add thegesturs/delulu \
  --skill manage-social-publishing \
  --global \
  --yes
```

Then start a new agent conversation and ask:

```text
Set up Delulu for me, connect my LinkedIn account, and tell me what remains before I can publish.
```

The skill teaches the agent to install the small `delulu` CLI if needed, start
secure browser authorization, and guide you through account connection and
billing. You do not need to clone this repository or manually configure the
CLI. The skill contains instructions only—never credentials.

For a browser-capable MCP client, connect:

```text
https://solulu.delulu.social/mcp
```

The human completes sign-in and approves a workspace plus scopes. The agent
never needs a social password or a pasted bearer token.

See the [agent setup guide](https://docs.delulu.social/getting-started/agent-setup/)
for the complete flow.

## Self-host

The Community deployment unlocks core scheduling, publishing, agent interfaces,
workspaces, reviews, and automations. You pay only for your infrastructure and
external providers.

```bash
cp deploy/self-host/.env.example deploy/self-host/.env
# Fill the required Clerk, R2, agent-signing, encryption, URL, and provider values.
docker compose --env-file deploy/self-host/.env \
  -f deploy/self-host/compose.yaml up -d --build --wait
```

The first self-hosted release requires operator-owned Clerk and Cloudflare R2
projects. Generic OIDC and S3-compatible storage are planned portability work;
the application services keep those dependencies behind replaceable boundaries.

Read the [self-hosting guide](https://docs.delulu.social/self-hosting/) before
exposing an instance to the internet. It covers required credentials,
callbacks, migrations, health checks, backups, upgrades, and limitations.

## Architecture

```text
human consent ─┐
               ├─ authenticated app ─┐
agent ─ MCP ───┤                     │
agent ─ CLI ───┼─ typed API ─ PostgreSQL ─ publisher ─ social networks
code  ─ REST ──┘          │
                          └─ object storage
```

The Docker deployment runs PostgreSQL, a migration job, the authenticated app,
the API, and a PostgreSQL-backed publisher. The hosted deployment can keep its
edge runtime and queue transport without changing domain behavior.

## Repository layout

```text
apps/
  app/         Authenticated Next.js product
  web/         Public marketing site
  api/         Typed API: edge and Node entrypoints
  docs/        Product, CLI, MCP, and API documentation
  cli/         Agent-first command line interface
  mcp/         MCP server and tool definitions
packages/
  contracts/   Public request, response, and error schemas
  core/        Domain types, policies, publishing validation and defaults
  services/    Effect services and use cases
  db/          PostgreSQL migrations and tooling
  worker/      Social publishing runtime
  connections/ Social-provider integrations
```

The authenticated product groups implementation under `apps/app/features`, with
shared navigation and resource lifecycle in `apps/app/shell`. Routes remain in
`apps/app/app`. See [Contributing](./CONTRIBUTING.md#product-code-organization) for
module boundaries and local navigation measurements.

## Local development

### Prerequisites

- Node.js 22.12 or newer
- pnpm 10.8.0 through Corepack
- Docker

```bash
corepack enable
pnpm install
pnpm pg:up
pnpm pg:migrate
cp apps/api/.dev.vars.example apps/api/.dev.vars
pnpm dev:app+api
```

The app runs on `http://localhost:3000` and the API worker runs on
`http://127.0.0.1:8788`. Point a Cloudflare Tunnel API route at port `8788`,
then register these public webhook endpoints:

```text
https://<api-tunnel-host>/webhooks/clerk
https://<api-tunnel-host>/webhooks/dodo
https://<api-tunnel-host>/webhooks/meta
https://<api-tunnel-host>/webhooks/cal
```

Copy each provider's signing secret into the matching variable documented in
`apps/api/.dev.vars.example`. OAuth connection callbacks also use the API
tunnel host under `/v1/connections/callback/:provider`.

Focused surfaces:

```bash
pnpm dev:web
pnpm dev:docs
pnpm cli -- --help
pnpm mcp
```

### Icon tiers

Application code imports icons through the neutral `@delulu/icons` package
alias. Public checkouts, Community builds, and self-hosted images resolve that
alias to the redistributable free icon set.

Licensed maintainers can use the Pro solid-rounded set in a private hosted
build without changing application imports:

```bash
pnpm icons:pro
# Configure the licensed @hugeicons-pro registry in the private build environment.
pnpm install --no-frozen-lockfile
pnpm build
```

The Pro command changes workspace manifests for that build. Do not commit the
resulting Pro dependency or lockfile, and never commit the registry token. Run
`pnpm icons:free && pnpm install` to return to the public Community setup. Only
developers covered by the appropriate icon license should access or maintain
the Pro build.

## Verification

```bash
pnpm check
pnpm typecheck
pnpm test
pnpm pg:migration-lint
```

Database integration suites require a migrated PostgreSQL instance. Container
and self-host smoke checks run in CI.

## Contributing and security

Issues and pull requests are welcome. Read [CONTRIBUTING.md](./CONTRIBUTING.md),
[SECURITY.md](./SECURITY.md), [SUPPORT.md](./SUPPORT.md), and the
[Code of Conduct](./.github/CODE_OF_CONDUCT.md) first.

Please report vulnerabilities privately through GitHub Security Advisories,
not a public issue.

## License

Delulu is licensed under the [GNU Affero General Public License v3.0](./LICENSE).
If you modify it and provide the modified software over a network, the AGPL
requires you to offer the corresponding source to those users.
