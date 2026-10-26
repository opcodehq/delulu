#!/usr/bin/env node
import {
  type ApiClient,
  decodeAutomationPatch,
  decodeAutomationWrite,
  makeSimplePostWrite,
  runEffect,
} from "@delulu/client";
import { Command, CommanderError } from "commander";
import { boundWorkspaceId } from "./api.js";
import {
  buildCommonAutomation,
  readAutomationJson,
} from "./automation-flow.js";
import { CliError, classifyError } from "./cli-error.js";
import { deleteCredentials, readCredentials } from "./config.js";
import { resolveContent } from "./content.js";
import {
  installIntegration,
  integrationStatus,
  removeIntegration,
} from "./integration.js";
import { login, openBrowser } from "./oauth.js";
import {
  completeOperation,
  findOperation,
  prepareOperation,
} from "./operation-journal.js";
import { formatError, resolveOutputMode } from "./output.js";
import {
  canonicalAccountSelector,
  type PostAccount,
  type PostFlowResult,
  parseTwitterOptions,
  resolveAccounts,
  splitValues,
  submitPost,
  validateTrialReelMedia,
  validateTrialReelOptions,
  validateTrialReelTargets,
  waitForPostTerminal,
} from "./post-flow.js";
import {
  presentAccounts,
  presentAutomation,
  presentAutomations,
  presentOverview,
  presentPost,
  presentPosts,
  presentReviews,
  presentWorkspaces,
} from "./presentation.js";
import {
  type CommandContext,
  executeCommand,
  type GlobalOptions,
  usageError,
} from "./runtime.js";
import {
  reportInvocation,
  shutdownTelemetry,
  trackCommand,
} from "./telemetry.js";
import { uploadLocalMedia } from "./upload.js";
import { CLI_VERSION } from "./version.js";

const program = new Command();
const TRAILING_SLASH = /\/$/;
const collect = (value: string, previous: string[]) => [...previous, value];
let commandSucceeded = true;

const options = () => program.opts<GlobalOptions>();
const run = async (
  handler: (context: CommandContext) => Promise<{
    readonly status: "ok";
    readonly message?: string;
    readonly summary?: Readonly<Record<string, unknown>>;
    readonly data?: unknown;
    readonly next?: readonly string[];
  }>
) => {
  const code = await executeCommand(options(), handler);
  commandSucceeded &&= code === 0;
};

const listAccounts = async (client: ApiClient, workspaceId: string) =>
  (
    await runEffect(
      client.connections.list({
        params: { workspaceId },
        query: { limit: 100 },
      })
    )
  ).data;

const automationScope = (workspaceId: string) => ({
  workspaceId,
  platform: "instagram" as const,
  category: "dm",
});

const addMedia = async (input: {
  readonly client: ApiClient;
  readonly workspaceId: string;
  readonly source: string;
  readonly altText?: string;
  readonly idempotencyKey?: string;
}) => {
  if (input.source.startsWith("media_")) {
    return input.source;
  }
  if (input.source.startsWith("https://")) {
    const imported = await runEffect(
      input.client.media.import({
        params: { workspaceId: input.workspaceId },
        payload: {
          url: input.source,
          altText: input.altText,
          idempotencyKey: input.idempotencyKey,
        },
      })
    );
    return imported.id;
  }
  return (
    await uploadLocalMedia({
      client: input.client,
      workspaceId: input.workspaceId,
      path: input.source,
      altText: input.altText,
    })
  ).id;
};

const requireConfirmation = (confirmed: boolean, command: string) => {
  if (!confirmed) {
    throw usageError(
      `This action requires --yes. Retry with: ${command} --yes`
    );
  }
};

const positiveNumber = (value: unknown, flag: string) => {
  const parsed = Number(value);
  if (!(Number.isFinite(parsed) && parsed > 0)) {
    throw usageError(`${flag} must be a positive number`);
  }
  return parsed;
};

const positiveInteger = (value: unknown, flag: string, maximum?: number) => {
  const parsed = Number(value);
  if (!(Number.isSafeInteger(parsed) && parsed > 0)) {
    throw usageError(`${flag} must be a positive integer`);
  }
  if (maximum !== undefined && parsed > maximum) {
    throw usageError(`${flag} must be at most ${maximum}`);
  }
  return parsed;
};

const isoTimestamp = (value: string, flag = "--at") => {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw usageError(`${flag} must be a valid ISO 8601 timestamp`);
  }
  return new Date(milliseconds).toISOString();
};

const helpExamples: Readonly<Record<string, readonly string[]>> = {
  login: ["delulu login"],
  workspace: ["delulu workspace", "delulu workspace use <selector>"],
  connect: ["delulu connect linkedin"],
  post: [
    'delulu post "Caption" --to linkedin --draft',
    'delulu post "Caption" --to linkedin --media video.mp4 --now',
    'delulu post "Caption" --to instagram --media video.mp4 --trial-reel --now',
    'delulu post "Take" --to x --quote https://x.com/user/status/123 --replies following',
    'delulu post --file article.md --to x --article "Article title" --draft',
  ],
  posts: ["delulu posts --status scheduled"],
  review: ["delulu review <post-id> --approve"],
};

const exitCodes = {
  0: "completed",
  1: "unexpected internal failure",
  2: "invalid syntax, flag, or confirmation",
  3: "authentication required",
  4: "permission, scope, membership, or workspace failure",
  5: "validation or quota failure",
  6: "conflict or rejected replay",
  7: "retryable network or provider failure",
  8: "partial target failure",
  9: "accepted operation timed out",
} as const;

program
  .name("delulu")
  .description("Publish and manage social content")
  .version(CLI_VERSION)
  .option("--api-url <url>", "API URL")
  .option("--workspace <id>", "Workspace override")
  .option("--toon", "Force TOON output")
  .option("--json", "Force JSON output")
  .option("--pretty", "Force human-readable output")
  .option("--full", "Show extended fields without text truncation")
  .showHelpAfterError(false)
  .configureOutput({ writeErr: () => undefined })
  .exitOverride();

program.hook("preAction", (_root, actionCommand) => {
  const path: string[] = [];
  for (
    let current: Command | null = actionCommand;
    current && current !== program;
    current = current.parent
  ) {
    path.unshift(current.name());
  }
  trackCommand(path.join(" ") || "overview");
});

program.action(() =>
  run(async ({ client, workspaceId }) => {
    const id = await workspaceId();
    const [overview, instance] = await Promise.all([
      runEffect(client.me.overview({ params: { workspaceId: id } })),
      runEffect(client.instance.capabilities()),
    ]);
    return presentOverview(overview, instance);
  })
);

program
  .command("login")
  .description("Authorize this CLI with device login")
  .option("--client-id <id>", "OAuth client id")
  .option("--issuer <url>", "OAuth issuer")
  .option("--loopback", "Use loopback PKCE")
  .action((command) =>
    run(async (context) => {
      await login({
        clientId: command.clientId,
        issuer: command.issuer,
        loopback: command.loopback,
        onChallenge: context.progress,
      });
      return {
        status: "ok",
        message: "Logged in",
        next: ["delulu", "delulu integrate install"],
      };
    })
  );

program
  .command("logout")
  .description("Remove local credentials")
  .option("--yes", "Confirm logout")
  .action((command) =>
    run(async () => {
      requireConfirmation(Boolean(command.yes), "delulu logout");
      const credentials = await readCredentials();
      if (credentials?.refreshToken) {
        await fetch(
          `${credentials.issuer.replace(TRAILING_SLASH, "")}/oauth/revoke`,
          {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ token: credentials.refreshToken }),
          }
        ).catch(() => undefined);
      }
      await deleteCredentials();
      return { status: "ok", message: "Logged out", next: ["delulu login"] };
    })
  );

const workspace = program
  .command("workspace")
  .description("Show or change the authorized workspace")
  .action(() =>
    run(async ({ client }) => {
      const page = await runEffect(client.me.workspaces());
      return presentWorkspaces(page, await boundWorkspaceId());
    })
  );

workspace
  .command("use <selector>")
  .description("Reauthorize for a different workspace")
  .action((selector) =>
    run(async (context) => {
      const page = await runEffect(context.client.me.workspaces());
      const normalized = String(selector).toLowerCase();
      const matches = page.data.filter(
        (item) =>
          item.workspaceId === selector ||
          item.slug?.toLowerCase() === normalized ||
          item.name.toLowerCase() === normalized
      );
      if (matches.length !== 1 || !matches[0]) {
        throw new CliError({
          code:
            matches.length === 0
              ? "WORKSPACE_NOT_FOUND"
              : "WORKSPACE_AMBIGUOUS",
          message:
            matches.length === 0
              ? `Workspace ${selector} was not found`
              : `Workspace ${selector} matches more than one membership; use its id`,
          exitCode: 4,
          next: ["delulu workspace"],
        });
      }
      if (matches[0].workspaceId === (await boundWorkspaceId())) {
        return {
          status: "ok",
          message: `${matches[0].name} is already active`,
          next: ["delulu"],
        };
      }
      const credentials = await readCredentials();
      await login({
        issuer: credentials?.issuer,
        clientId: credentials?.clientId,
        workspaceHint: matches[0].workspaceId,
        scopes: credentials?.scope,
        onChallenge: context.progress,
      });
      return {
        status: "ok",
        message: `Switched to ${matches[0].name}`,
        summary: { workspace: matches[0].workspaceId, role: matches[0].role },
        next: ["delulu"],
      };
    })
  );

program
  .command("accounts")
  .description("List connected social accounts")
  .action(() =>
    run(async ({ client, workspaceId, options: global }) => {
      const id = await workspaceId();
      const page = await runEffect(
        client.connections.list({
          params: { workspaceId: id },
          query: { limit: 100 },
        })
      );
      return presentAccounts(page, global.full);
    })
  );

program
  .command("automations")
  .description("List Instagram DM automations")
  .option("--limit <count>", "Number of automations", "20")
  .option("--offset <count>", "Pagination offset", "0")
  .action((command) =>
    run(async ({ client, workspaceId }) => {
      const limit = positiveInteger(command.limit, "--limit", 100);
      const offset = Number(command.offset);
      if (!(Number.isSafeInteger(offset) && offset >= 0)) {
        throw usageError("--offset must be a non-negative integer");
      }
      const id = await workspaceId();
      return presentAutomations(
        await runEffect(
          client.automations.list({
            params: automationScope(id),
            query: { limit, offset },
          })
        )
      );
    })
  );

const automation = program
  .command("automation")
  .description("Manage Instagram DM automations");

automation
  .command("show <id>")
  .description("Show complete automation details")
  .action((automationId) =>
    run(async ({ client, workspaceId }) => {
      const id = await workspaceId();
      return presentAutomation(
        await runEffect(
          client.automations.get({
            params: { ...automationScope(id), id: automationId },
          })
        )
      );
    })
  );

automation
  .command("posts")
  .description("List selectable Instagram media")
  .requiredOption("--account <selector>", "Instagram account selector")
  .option("--stories", "List Stories instead of posts and Reels")
  .option("--limit <count>", "Number of media items", "25")
  .option("--after <cursor>", "Continue from a media cursor")
  .action((command) =>
    run(async ({ client, workspaceId }) => {
      const id = await workspaceId();
      const [account] = resolveAccounts(await listAccounts(client, id), [
        command.account,
      ]);
      if (account?.platform.toLowerCase() !== "instagram") {
        throw usageError("--account must select an Instagram connection", [
          "delulu accounts",
        ]);
      }
      const limit = positiveInteger(command.limit, "--limit", 100);
      const page = await runEffect(
        client.connections.media({
          params: { workspaceId: id, id: account.id },
          query: {
            kind: command.stories ? "stories" : "posts",
            limit,
            ...(command.after ? { after: command.after } : {}),
          },
        })
      );
      return {
        status: "ok",
        message: `${page.data.length} media items`,
        summary: {
          account: canonicalAccountSelector(account),
          nextCursor: page.nextCursor,
        },
        data: page.data,
        next: page.nextCursor
          ? [
              `delulu automation posts --account ${canonicalAccountSelector(account)}${command.stories ? " --stories" : ""} --after ${page.nextCursor}`,
            ]
          : ["delulu automation create --help"],
      };
    })
  );

automation
  .command("create")
  .description("Create an Instagram DM automation")
  .option("--account <selector>", "Instagram account selector")
  .option("--name <name>", "Automation name")
  .option(
    "--post <id>",
    "Target a live media id or pending:<post-id>",
    collect,
    []
  )
  .option("--all-posts", "Target any current or future media")
  .option("--stories", "Create a Story Reply automation")
  .option("--keyword <text>", "Required comment or reply text")
  .option("--match <operator>", "Keyword matching operator", "contains")
  .option("--case-sensitive", "Match keyword casing")
  .option("--message <text>", "DM message")
  .option("--comment-reply <text>", "Public comment reply", collect, [])
  .option("--disabled", "Create disabled")
  .option("--file <path>", "Validated API JSON file, or - for stdin")
  .option("--idempotency-key <key>", "Stable retry key")
  .option("--new", "Force a new journal operation")
  .action((command) =>
    run(async ({ client, workspaceId }) => {
      const id = await workspaceId();
      let payload: Record<string, unknown>;
      if (command.file) {
        if (
          command.account ||
          command.name ||
          command.post.length > 0 ||
          command.allPosts ||
          command.stories ||
          command.keyword ||
          command.message ||
          command.commentReply.length > 0 ||
          command.disabled
        ) {
          throw usageError(
            "--file cannot be combined with common automation flags"
          );
        }
        payload = decodeAutomationWrite(
          await readAutomationJson(command.file)
        ) as Record<string, unknown>;
      } else {
        if (!command.account) {
          throw usageError("--account is required without --file");
        }
        const [account] = resolveAccounts(await listAccounts(client, id), [
          command.account,
        ]);
        if (account?.platform.toLowerCase() !== "instagram") {
          throw usageError("--account must select an Instagram connection");
        }
        payload = buildCommonAutomation(account.id, command);
      }
      const operation = await prepareOperation({
        command: "automation create",
        fingerprintValue: { workspaceId: id, payload },
        forceNew: command.new,
        idempotencyKey: command.idempotencyKey,
      });
      if (operation.resourceId) {
        const existing = await runEffect(
          client.automations.get({
            params: { ...automationScope(id), id: operation.resourceId },
          })
        );
        return {
          ...presentAutomation(existing),
          summary: {
            ...presentAutomation(existing).summary,
            replayed: true,
            operation: operation.operationId,
          },
        };
      }
      const created = await runEffect(
        client.automations.create({
          params: automationScope(id),
          payload: {
            ...payload,
            idempotencyKey: operation.idempotencyKey,
          } as never,
        })
      );
      await completeOperation(operation.operationId, created.id);
      return {
        ...presentAutomation(created),
        summary: {
          ...presentAutomation(created).summary,
          replayed: operation.replayed,
          operation: operation.operationId,
        },
      };
    })
  );

automation
  .command("update <id>")
  .description("Patch an Instagram DM automation")
  .option("--name <name>", "New automation name")
  .option("--post <id>", "Replace targets", collect, [])
  .option("--all-posts", "Target any current or future media")
  .option("--keyword <text>", "Replace keyword")
  .option("--match <operator>", "Keyword matching operator", "contains")
  .option("--case-sensitive", "Match keyword casing")
  .option("--message <text>", "Replace DM message")
  .option("--comment-reply <text>", "Replace public replies", collect, [])
  .option("--enable", "Enable the automation")
  .option("--disable", "Disable the automation")
  .option("--file <path>", "Validated patch JSON file, or - for stdin")
  .option("--new", "Force a new journal operation")
  .action((automationId, command) =>
    run(async ({ client, workspaceId }) => {
      if (command.enable && command.disable) {
        throw usageError("--enable and --disable are mutually exclusive");
      }
      const id = await workspaceId();
      let patch: Record<string, unknown>;
      if (command.file) {
        if (
          command.name ||
          command.post.length > 0 ||
          command.allPosts ||
          command.keyword ||
          command.message ||
          command.commentReply.length > 0 ||
          command.enable ||
          command.disable
        ) {
          throw usageError("--file cannot be combined with patch flags");
        }
        patch = decodeAutomationPatch(
          await readAutomationJson(command.file)
        ) as Record<string, unknown>;
      } else {
        const current = await runEffect(
          client.automations.get({
            params: { ...automationScope(id), id: automationId },
          })
        );
        patch = {};
        if (command.name) {
          patch.name = command.name;
        }
        if (command.enable || command.disable) {
          patch.enabled = Boolean(command.enable);
        }
        const changeTargets = command.allPosts || command.post.length > 0;
        const changeGraph =
          changeTargets ||
          command.keyword !== undefined ||
          command.message !== undefined ||
          command.commentReply.length > 0;
        if (changeGraph) {
          const firstTrigger = current.triggers[0];
          const firstDm = current.steps.find((step) => step.type === "send_dm");
          if (
            current.triggers.length !== 1 ||
            current.steps.length !== 1 ||
            !firstTrigger ||
            !firstDm
          ) {
            throw usageError(
              "Common graph flags only support one-trigger, one-message automations; use --file for advanced graphs"
            );
          }
          const common = buildCommonAutomation(current.connectionId, {
            name: command.name ?? current.name,
            post: changeTargets
              ? command.post
              : [
                  ...firstTrigger.targetPostIds,
                  ...(firstTrigger.pendingPostIds ?? []).map(
                    (postId) => `pending:${postId}`
                  ),
                ],
            allPosts: changeTargets
              ? Boolean(command.allPosts)
              : (firstTrigger.targetMode ??
                  (firstTrigger.targetPostIds.length === 0 &&
                  (firstTrigger.pendingPostIds?.length ?? 0) === 0
                    ? "all"
                    : "specific")) === "all",
            stories: firstTrigger.triggerType === "story_reply",
            keyword: command.keyword ?? firstTrigger.keywordFilter?.value,
            match:
              command.keyword === undefined
                ? firstTrigger.keywordFilter?.operator
                : command.match,
            caseSensitive:
              command.keyword === undefined
                ? firstTrigger.keywordFilter?.caseSensitive
                : command.caseSensitive,
            message: command.message ?? firstDm?.messageTemplate,
            commentReply:
              command.commentReply.length > 0
                ? command.commentReply
                : firstTrigger.commentReply?.replies,
            disabled:
              command.enable || command.disable
                ? command.disable
                : !current.enabled,
          });
          patch.triggers = common.triggers;
          patch.steps = common.steps;
        }
        if (Object.keys(patch).length === 0) {
          throw usageError("Provide at least one update flag or --file");
        }
      }
      const operation = await prepareOperation({
        command: "automation update",
        fingerprintValue: { workspaceId: id, automationId, patch },
        forceNew: command.new,
      });
      const updated = await runEffect(
        client.automations.update({
          params: { ...automationScope(id), id: automationId },
          payload: patch as never,
        })
      );
      await completeOperation(operation.operationId, updated.id);
      return presentAutomation(updated);
    })
  );

for (const enabled of [true, false] as const) {
  automation
    .command(`${enabled ? "enable" : "disable"} <id>`)
    .description(`${enabled ? "Enable" : "Disable"} an automation`)
    .option("--new", "Force a new journal operation")
    .action((automationId, command) =>
      run(async ({ client, workspaceId }) => {
        const id = await workspaceId();
        const operation = await prepareOperation({
          command: `automation ${enabled ? "enable" : "disable"}`,
          fingerprintValue: { workspaceId: id, automationId, enabled },
          forceNew: command.new,
        });
        const updated = await runEffect(
          client.automations.update({
            params: { ...automationScope(id), id: automationId },
            payload: { enabled },
          })
        );
        await completeOperation(operation.operationId, updated.id);
        return presentAutomation(updated);
      })
    );
}

automation
  .command("delete <id>")
  .description("Permanently delete an automation")
  .option("--yes", "Confirm deletion")
  .option("--new", "Force a new journal operation")
  .action((automationId, command) =>
    run(async ({ client, workspaceId }) => {
      requireConfirmation(
        Boolean(command.yes),
        `delulu automation delete ${automationId}`
      );
      const id = await workspaceId();
      const operation = await prepareOperation({
        command: "automation delete",
        fingerprintValue: { workspaceId: id, automationId },
        forceNew: command.new,
      });
      if (!operation.resourceId) {
        await runEffect(
          client.automations.remove({
            params: { ...automationScope(id), id: automationId },
          })
        );
        await completeOperation(operation.operationId, automationId);
      }
      return {
        status: "ok",
        message: "Automation deleted",
        summary: { id: automationId, replayed: operation.replayed },
        next: ["delulu automations"],
      };
    })
  );

program
  .command("connect <platform>")
  .description("Connect a social account")
  .option("--no-wait", "Return after creating the authorization URL")
  .option("--timeout <seconds>", "Callback wait timeout", "600")
  .option("--new", "Connect another account on the same platform")
  .action((platform, command) =>
    run(async (context) => {
      const timeout = positiveNumber(command.timeout, "--timeout");
      const workspaceId = await context.workspaceId();
      const before = await listAccounts(context.client, workspaceId);
      const operation = await prepareOperation({
        command: "connect",
        fingerprintValue: {
          workspaceId,
          platform: String(platform).toUpperCase(),
        },
        forceNew: command.new,
      });
      if (operation.resourceId) {
        const existing = before.find(
          (account) => account.id === operation.resourceId
        );
        if (existing) {
          return {
            status: "ok",
            message: `${existing.platform} is already connected`,
            summary: { replayed: true, operation: operation.operationId },
            data: { id: existing.id, username: existing.username },
            next: ["delulu accounts"],
          };
        }
      }
      if (operation.replayed) {
        throw new CliError({
          code: "CONNECTION_AUTHORIZATION_IN_PROGRESS",
          message:
            "An identical account authorization was already started and cannot be minted twice",
          exitCode: 6,
          details: { operation: operation.operationId },
          next: ["delulu accounts", `delulu connect ${platform} --new`],
        });
      }
      const result = await runEffect(
        context.client.connections.mint({
          params: { workspaceId, platform: String(platform).toUpperCase() },
          payload: { includeInsights: true, client: "cli" },
        })
      );
      context.progress({
        event: "connection_authorization_required",
        platform: String(platform).toLowerCase(),
        url: result.url,
        expiresIn: result.expiresIn,
      });
      openBrowser(result.url);
      if (!command.wait) {
        return {
          status: "ok",
          message: "Authorization URL created",
          data: {
            platform: String(platform).toLowerCase(),
            url: result.url,
            expiresIn: result.expiresIn,
          },
          next: ["delulu accounts"],
        };
      }
      const deadline = Date.now() + timeout * 1000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const after = await listAccounts(context.client, workspaceId);
        const connected = after.find(
          (account) =>
            !before.some((previous) => previous.id === account.id) &&
            account.platform.toLowerCase() === String(platform).toLowerCase()
        );
        if (connected) {
          await completeOperation(operation.operationId, connected.id);
          const selector = canonicalAccountSelector(connected);
          return {
            status: "ok",
            message: `${connected.platform} connected`,
            data: {
              selector,
              name: connected.displayName ?? connected.username ?? connected.id,
            },
            next: [
              "delulu",
              `delulu post "Your caption" --to ${selector} --draft`,
            ],
          };
        }
      }
      throw new CliError({
        code: "CONNECTION_TIMEOUT",
        message:
          "The account connection did not finish before the authorization expired",
        exitCode: 9,
        retryable: true,
        next: [`delulu connect ${platform}`],
      });
    })
  );

program
  .command("disconnect <account>")
  .description("Remove a connected account")
  .option("--yes", "Confirm removal")
  .option("--new", "Force a new removal operation")
  .action((selector, command) =>
    run(async ({ client, workspaceId }) => {
      requireConfirmation(
        Boolean(command.yes),
        `delulu disconnect ${selector}`
      );
      const id = await workspaceId();
      const operation = await prepareOperation({
        command: "disconnect",
        fingerprintValue: { workspaceId: id, selector },
        forceNew: command.new,
      });
      if (operation.resourceId) {
        return {
          status: "ok",
          message: "Account was already disconnected",
          summary: { replayed: true, account: operation.resourceId },
          next: ["delulu accounts"],
        };
      }
      const [account] = resolveAccounts(await listAccounts(client, id), [
        selector,
      ]);
      await runEffect(
        client.connections.remove({
          params: { workspaceId: id, id: account.id },
        })
      );
      await completeOperation(operation.operationId, account.id);
      return {
        status: "ok",
        message: `${account.platform} account disconnected`,
        next: ["delulu accounts"],
      };
    })
  );

program
  .command("subscribe")
  .description("Start hosted subscription checkout")
  .requiredOption("--plan <plan>", "ECHO or VIBE")
  .requiredOption("--interval <interval>", "MONTHLY or YEARLY")
  .option("--currency <currency>", "USD or INR", "USD")
  .option("--idempotency-key <key>", "Stable retry key")
  .option("--new", "Start a distinct checkout")
  .action((command) =>
    run(async ({ client, workspaceId }) => {
      const id = await workspaceId();
      const plan = String(command.plan).toUpperCase();
      const interval = String(command.interval).toUpperCase();
      const currency = String(command.currency).toUpperCase();
      if (!(plan === "ECHO" || plan === "VIBE")) {
        throw usageError("--plan must be ECHO or VIBE");
      }
      if (!(interval === "MONTHLY" || interval === "YEARLY")) {
        throw usageError("--interval must be MONTHLY or YEARLY");
      }
      if (!(currency === "USD" || currency === "INR")) {
        throw usageError("--currency must be USD or INR");
      }
      const operation = await prepareOperation({
        command: "subscribe",
        fingerprintValue: { workspaceId: id, plan, interval, currency },
        forceNew: command.new,
        idempotencyKey: command.idempotencyKey,
      });
      const checkout = await runEffect(
        client.billing.checkout({
          params: { workspaceId: id },
          payload: {
            plan,
            interval,
            currency,
            idempotencyKey: operation.idempotencyKey,
          },
        })
      );
      return {
        status: "ok",
        message: "Checkout created",
        summary: {
          operation: operation.operationId,
          replayed: operation.replayed,
        },
        data: {
          plan,
          interval,
          currency,
          status: "awaiting_payment",
          url: checkout.url,
        },
        next: [checkout.url, "delulu"],
      };
    })
  );

program
  .command("usage")
  .description("Show subscription and pooled usage")
  .action(() =>
    run(async ({ client, workspaceId, options: global }) => {
      const id = await workspaceId();
      const [subscription, usage] = await Promise.all([
        runEffect(client.billing.subscription({ params: { workspaceId: id } })),
        runEffect(client.billing.usage({ params: { workspaceId: id } })),
      ]);
      const subscriptionState = subscription ?? {
        plan: "FREE",
        status: "inactive",
        billingInterval: null,
        currentPeriodEnd: null,
      };
      return {
        status: "ok",
        message: `${subscriptionState.plan} ${subscriptionState.status}`,
        summary: {
          plan: subscriptionState.plan,
          status: subscriptionState.status,
          interval: subscriptionState.billingInterval,
          renews: subscriptionState.currentPeriodEnd,
        },
        data: global.full ? { subscription, usage: usage.usage } : usage.usage,
        next:
          subscriptionState.status === "active"
            ? ["delulu"]
            : ["delulu subscribe --plan VIBE --interval MONTHLY"],
      };
    })
  );

program
  .command("upload <source>")
  .description("Upload local media or import a public HTTPS URL")
  .option("--alt <text>", "Alt text")
  .option("--idempotency-key <key>", "Stable retry key")
  .option("--new", "Create a new operation even if this was recently run")
  .action((source, command) =>
    run(async ({ client, workspaceId }) => {
      const id = await workspaceId();
      const operation = await prepareOperation({
        command: "upload",
        fingerprintValue: { workspaceId: id, source, alt: command.alt },
        forceNew: command.new,
        idempotencyKey: command.idempotencyKey,
      });
      if (operation.resourceId) {
        const media = await runEffect(
          client.media.get({
            params: { workspaceId: id, id: operation.resourceId },
          })
        );
        return {
          status: "ok",
          message: "Media already prepared",
          data: media,
          summary: { replayed: true },
          next: [`delulu post "Caption" --media ${media.id} --draft`],
        };
      }
      const mediaId = await addMedia({
        client,
        workspaceId: id,
        source,
        altText: command.alt,
        idempotencyKey: operation.idempotencyKey,
      });
      await completeOperation(operation.operationId, mediaId);
      const media = await runEffect(
        client.media.get({ params: { workspaceId: id, id: mediaId } })
      );
      return {
        status: "ok",
        message: "Media ready",
        data: {
          id: media.id,
          type: media.mediaType,
          bytes: media.sizeBytes,
          status: media.status,
        },
        summary: {
          operation: operation.operationId,
          replayed: operation.replayed,
        },
        next: [`delulu post "Caption" --media ${media.id} --draft`],
      };
    })
  );

program
  .command("post [caption]")
  .description("Create a draft, schedule, or publish atomically")
  .option("--file <path>", "Read content from a UTF-8 file")
  .requiredOption(
    "-t, --to <account>",
    "Canonical platform:connection-id, account id, platform, username, or platform@username",
    collect,
    []
  )
  .option(
    "-m, --media <source>",
    "Local path, public HTTPS URL, or media id",
    collect,
    []
  )
  .option("--alt <text>", "Media alt text")
  .option("--draft", "Create a draft (the default)")
  .option("--now", "Publish immediately")
  .option("--at <timestamp>", "Schedule at an ISO 8601 timestamp")
  .option("--privacy <status>", "Platform privacy setting")
  .option("--trial-reel", "Publish Instagram video as a Trial Reel")
  .option(
    "--graduation-strategy <strategy>",
    "Trial Reel graduation: manual or performance (default: manual)"
  )
  .option("--quote <post>", "X: quote this post URL or ID from the first post")
  .option(
    "--replies <who>",
    "X: who can reply: everyone, following, or mentioned"
  )
  .option("--article <title>", "X: publish a native Article with this title")
  .option("--idempotency-key <key>", "Stable retry key")
  .option("--new", "Intentionally create a duplicate")
  .option("--no-wait", "Return after publishing is accepted")
  .option("--timeout <seconds>", "Publish wait timeout", "360")
  .action((caption, command) =>
    run(async ({ client, workspaceId }) => {
      const content = await resolveContent({
        argument: caption,
        file: command.file,
        stdin: process.stdin,
        required: true,
      });
      const intents = [command.draft, command.now, command.at].filter(
        Boolean
      ).length;
      if (intents > 1) {
        throw usageError("Choose only one of --draft, --now, or --at");
      }
      if (splitValues(command.to).length === 0) {
        throw usageError("At least one --to <account> target is required", [
          "delulu accounts",
        ]);
      }
      validateTrialReelOptions({
        trialReel: Boolean(command.trialReel),
        graduationStrategy: command.graduationStrategy,
        mediaSources: command.media,
      });
      const twitter = parseTwitterOptions({
        quote: command.quote,
        replies: command.replies,
        article: command.article,
      });
      const timeout = positiveNumber(command.timeout, "--timeout");
      const id = await workspaceId();
      const intent = command.now
        ? "publish_now"
        : command.at
          ? "schedule"
          : "draft";
      const fingerprintValue = {
        workspaceId: id,
        content,
        to: splitValues(command.to).sort(),
        media: splitValues(command.media),
        intent,
        at: command.at,
        privacy: command.privacy,
        trialReel: Boolean(command.trialReel),
        graduationStrategy: command.graduationStrategy,
        twitter,
      };
      const completedReplay = await findOperation({
        command: "post",
        fingerprintValue,
        forceNew: command.new,
      });
      if (completedReplay?.resourceId) {
        const previous = await runEffect(
          client.posts.get({
            params: { workspaceId: id, id: completedReplay.resourceId },
          })
        );
        const presented = presentPost(previous, { full: options().full });
        return {
          ...presented,
          summary: {
            ...presented.summary,
            replayed: true,
            operation: completedReplay.operationId,
          },
        };
      }
      let availableAccounts: readonly PostAccount[] | undefined;
      let existingTrialReelMedia:
        | { readonly id: string; readonly mediaType: string }
        | undefined;
      if (command.trialReel) {
        availableAccounts = await listAccounts(client, id);
        validateTrialReelTargets(
          true,
          resolveAccounts(availableAccounts, command.to)
        );
        const source = splitValues(command.media)[0] as string;
        if (source.startsWith("media_")) {
          const media = await runEffect(
            client.media.get({ params: { workspaceId: id, id: source } })
          );
          existingTrialReelMedia = {
            id: media.id,
            mediaType: media.mediaType,
          };
          validateTrialReelMedia(true, existingTrialReelMedia);
        }
      }
      const operation = await prepareOperation({
        command: "post",
        fingerprintValue,
        forceNew: command.new,
        idempotencyKey: command.idempotencyKey,
      });
      if (operation.resourceId) {
        const previous = await runEffect(
          client.posts.get({
            params: { workspaceId: id, id: operation.resourceId },
          })
        );
        const presented = presentPost(previous, { full: options().full });
        return {
          ...presented,
          summary: {
            ...presented.summary,
            replayed: true,
            operation: operation.operationId,
          },
        };
      }
      let mediaIndex = 0;
      let result: PostFlowResult;
      try {
        result = await submitPost(
          {
            caption: content as string,
            accountSelectors: command.to,
            mediaSources: command.media,
            altText: command.alt,
            intent,
            scheduledAt: command.at,
            privacy: command.privacy,
            trialReel: Boolean(command.trialReel),
            graduationStrategy: command.graduationStrategy,
            twitter,
            idempotencyKey: operation.idempotencyKey,
            waitForTerminal: command.wait,
            timeoutMs: timeout * 1000,
          },
          {
            listAccounts: () =>
              availableAccounts
                ? Promise.resolve(availableAccounts)
                : listAccounts(client, id),
            addMedia: async (source, altText) => {
              if (existingTrialReelMedia?.id === source) {
                return existingTrialReelMedia;
              }
              const mediaId = await addMedia({
                client,
                workspaceId: id,
                source,
                altText,
                idempotencyKey: `${operation.idempotencyKey}:media:${mediaIndex++}`,
              });
              if (!command.trialReel) {
                return { id: mediaId, mediaType: "UNKNOWN" };
              }
              const media = await runEffect(
                client.media.get({ params: { workspaceId: id, id: mediaId } })
              );
              return { id: media.id, mediaType: media.mediaType };
            },
            create: (input) =>
              runEffect(
                client.posts.create({
                  params: { workspaceId: id },
                  payload: makeSimplePostWrite({
                    caption: input.caption,
                    connections: input.connections,
                    mediaIds: input.mediaIds,
                    intent: input.intent,
                    idempotencyKey: input.idempotencyKey,
                    scheduledAt: input.scheduledAt,
                    privacy: input.privacy,
                  }),
                })
              ),
            get: (postId) =>
              runEffect(
                client.posts.get({ params: { workspaceId: id, id: postId } })
              ),
            sleep: (milliseconds) =>
              new Promise((resolve) => setTimeout(resolve, milliseconds)),
            now: Date.now,
          }
        );
      } catch (cause) {
        if (
          cause instanceof CliError &&
          typeof cause.details?.postId === "string"
        ) {
          await completeOperation(operation.operationId, cause.details.postId);
        }
        throw cause;
      }
      await completeOperation(operation.operationId, result.id);
      const authoritative = await runEffect(
        client.posts.get({ params: { workspaceId: id, id: result.id } })
      );
      const presented = presentPost(authoritative, { full: options().full });
      return {
        ...presented,
        summary: {
          ...presented.summary,
          operation: operation.operationId,
          replayed: operation.replayed,
        },
      };
    })
  );

program
  .command("posts [legacy]")
  .description("List recent posts")
  .option("--status <status>", "Filter by status")
  .option("--limit <count>", "Number of posts", "10")
  .option("--offset <count>", "Pagination offset", "0")
  .action((legacy, command) =>
    run(async ({ client, workspaceId, options: global }) => {
      if (legacy) {
        const replacement =
          legacy === "list"
            ? "delulu posts"
            : legacy === "create"
              ? "delulu post"
              : legacy === "schedule"
                ? "delulu post --at <timestamp>"
                : legacy === "update"
                  ? "delulu edit <post-id>"
                  : undefined;
        throw usageError(
          replacement
            ? `The posts ${legacy} command was removed. Use ${replacement}.`
            : `Unexpected argument: ${legacy}`,
          [replacement ?? "delulu help posts"]
        );
      }
      const limit = Number(command.limit);
      const offset = Number(command.offset);
      if (!(Number.isSafeInteger(limit) && limit > 0 && limit <= 100)) {
        throw usageError("--limit must be between 1 and 100");
      }
      if (!(Number.isSafeInteger(offset) && offset >= 0)) {
        throw usageError("--offset must be a non-negative integer");
      }
      const id = await workspaceId();
      const page = await runEffect(
        client.posts.list({
          params: { workspaceId: id },
          query: {
            limit,
            offset,
            ...(command.status ? { status: command.status } : {}),
          },
        })
      );
      return presentPosts(page, { full: global.full, workspaceId: id });
    })
  );

program
  .command("show <post-id>")
  .description("Inspect a post and its targets")
  .action((postId) =>
    run(async ({ client, workspaceId, options: global }) => {
      const id = await workspaceId();
      return presentPost(
        await runEffect(
          client.posts.get({ params: { workspaceId: id, id: postId } })
        ),
        { full: global.full }
      );
    })
  );

program
  .command("edit <post-id> [caption]")
  .description("Edit a draft or scheduled post without publishing it")
  .option("--file <path>", "Read replacement content from a UTF-8 file")
  .option("-t, --to <account>", "Replace target accounts", collect, [])
  .option("-m, --media <source>", "Replace media", collect, [])
  .option("--alt <text>", "Media alt text")
  .option("--privacy <status>", "Platform privacy setting")
  .option("--at <timestamp>", "Replace the schedule")
  .option("--draft", "Move back to draft")
  .option("--new", "Force a new edit operation")
  .action((postId, caption, command) =>
    run(async ({ client, workspaceId, options: global }) => {
      if (command.at && command.draft) {
        throw usageError("Choose only one of --at or --draft");
      }
      const replacement = await resolveContent({
        argument: caption,
        file: command.file,
        stdin: process.stdin,
      });
      const id = await workspaceId();
      const operation = await prepareOperation({
        command: "edit",
        fingerprintValue: {
          workspaceId: id,
          postId,
          replacement,
          to: splitValues(command.to).sort(),
          media: splitValues(command.media),
          privacy: command.privacy,
          at: command.at,
          draft: Boolean(command.draft),
        },
        forceNew: command.new,
      });
      if (operation.resourceId) {
        const previous = await runEffect(
          client.posts.get({ params: { workspaceId: id, id: postId } })
        );
        const presented = presentPost(previous, { full: global.full });
        return {
          ...presented,
          summary: { ...presented.summary, replayed: true },
        };
      }
      const current = await runEffect(
        client.posts.get({ params: { workspaceId: id, id: postId } })
      );
      if (
        current.groups.length !== 1 ||
        current.groups[0]?.segments.length !== 1
      ) {
        throw new CliError({
          code: "COMPLEX_POST_EDIT",
          message: "This post has multiple segments; edit it in the web editor",
          exitCode: 5,
        });
      }
      const accounts = await listAccounts(client, id);
      const selected: readonly PostAccount[] = command.to.length
        ? resolveAccounts(accounts, command.to)
        : current.targets.map((target) => {
            const account = accounts.find(
              (item) => item.id === target.connectionId
            );
            if (!account) {
              throw new Error(
                `Connected account ${target.connectionId} is unavailable`
              );
            }
            return account;
          });
      const existingMedia =
        current.groups[0].segments[0]?.media.map((media) => media.id) ?? [];
      const mediaIds = command.media.length
        ? await Promise.all(
            command.media.map((source: string, index: number) =>
              addMedia({
                client,
                workspaceId: id,
                source,
                altText: command.alt,
                idempotencyKey: `${operation.idempotencyKey}:media:${index}`,
              })
            )
          )
        : existingMedia;
      const scheduledAt = command.at
        ? isoTimestamp(command.at)
        : command.draft
          ? null
          : (current.targets[0]?.scheduledAt ?? null);
      const payload = makeSimplePostWrite({
        caption: replacement ?? current.groups[0].segments[0]?.text ?? "",
        connections: selected.map((account) => ({
          id: account.id,
          platform: account.platform,
        })),
        mediaIds,
        intent: scheduledAt ? "schedule" : "draft",
        scheduledAt,
        privacy: command.privacy,
      });
      const updated = await runEffect(
        client.posts.update({
          params: { workspaceId: id, id: postId },
          payload,
        })
      );
      await completeOperation(operation.operationId, postId);
      return presentPost(updated, { full: global.full });
    })
  );

program
  .command("publish <post-id>")
  .description("Publish an existing draft")
  .option("--now", "Confirm immediate publishing")
  .option("--new", "Force a new publish operation")
  .option("--no-wait", "Return after publishing is accepted")
  .option("--timeout <seconds>", "Publish wait timeout", "360")
  .action((postId, command) =>
    run(async ({ client, workspaceId, options: global }) => {
      if (!command.now) {
        throw usageError(
          `Immediate publishing requires --now. Retry with: delulu publish ${postId} --now`
        );
      }
      const timeout = positiveNumber(command.timeout, "--timeout");
      const id = await workspaceId();
      const operation = await prepareOperation({
        command: "publish",
        fingerprintValue: { workspaceId: id, postId },
        forceNew: command.new,
      });
      if (operation.resourceId) {
        const previous = await runEffect(
          client.posts.get({ params: { workspaceId: id, id: postId } })
        );
        const presented = presentPost(previous, { full: global.full });
        return {
          ...presented,
          summary: { ...presented.summary, replayed: true },
        };
      }
      const result = await runEffect(
        client.posts.publishNow({ params: { workspaceId: id, id: postId } })
      );
      await completeOperation(operation.operationId, postId);
      const authoritative = command.wait
        ? await waitForPostTerminal(result, {
            get: (idToFetch) =>
              runEffect(
                client.posts.get({
                  params: { workspaceId: id, id: idToFetch },
                })
              ),
            sleep: (milliseconds) =>
              new Promise((resolve) => setTimeout(resolve, milliseconds)),
            now: Date.now,
            timeoutMs: timeout * 1000,
          })
        : result;
      return presentPost(authoritative, { full: global.full });
    })
  );

program
  .command("retry <post-id>")
  .description("Retry failed publishing targets")
  .option("--target <id>", "Retry one failed target")
  .option("--new", "Force a new retry operation")
  .action((postId, command) =>
    run(async ({ client, workspaceId }) => {
      const id = await workspaceId();
      const operation = await prepareOperation({
        command: "retry",
        fingerprintValue: { workspaceId: id, postId, target: command.target },
        forceNew: command.new,
      });
      if (operation.resourceId) {
        const previous = await runEffect(
          client.posts.get({ params: { workspaceId: id, id: postId } })
        );
        const presented = presentPost(previous, { full: options().full });
        return {
          ...presented,
          summary: { ...presented.summary, replayed: true },
        };
      }
      const post = await runEffect(
        client.posts.get({ params: { workspaceId: id, id: postId } })
      );
      const failed = post.targets.filter(
        (target) => target.status === "failed"
      );
      const selected = command.target
        ? failed.filter((target) => target.id === command.target)
        : failed;
      if (selected.length === 0) {
        throw new CliError({
          code: "NO_FAILED_TARGETS",
          message: "0 failed targets are available to retry",
          exitCode: 5,
          next: [`delulu show ${postId}`],
        });
      }
      const retried = [];
      for (const target of selected) {
        retried.push(
          await runEffect(
            client.posts.retryTarget({
              params: { workspaceId: id, id: postId, targetId: target.id },
            })
          )
        );
      }
      await completeOperation(operation.operationId, postId);
      return {
        status: "ok",
        message: `${retried.length} targets queued`,
        summary: { post: postId, retried: retried.length },
        data: retried.map((target) => ({
          id: target.id,
          state: target.status,
        })),
        next: [`delulu show ${postId}`],
      };
    })
  );

program
  .command("delete <post-id>")
  .description("Delete a post")
  .option("--yes", "Confirm deletion")
  .option("--new", "Force a new deletion operation")
  .action((postId, command) =>
    run(async ({ client, workspaceId }) => {
      requireConfirmation(Boolean(command.yes), `delulu delete ${postId}`);
      const id = await workspaceId();
      const operation = await prepareOperation({
        command: "delete",
        fingerprintValue: { workspaceId: id, postId },
        forceNew: command.new,
      });
      if (operation.resourceId) {
        return {
          status: "ok",
          message: `${postId} was already deleted`,
          summary: { replayed: true },
          next: ["delulu posts"],
        };
      }
      await runEffect(
        client.posts.remove({ params: { workspaceId: id, id: postId } })
      );
      await completeOperation(operation.operationId, postId);
      return {
        status: "ok",
        message: `Deleted ${postId}`,
        next: ["delulu posts"],
      };
    })
  );

program
  .command("reviews")
  .description("List the review queue")
  .option("--limit <count>", "Number of reviews", "10")
  .option("--offset <count>", "Pagination offset", "0")
  .action((command) =>
    run(async ({ client, workspaceId }) => {
      const id = await workspaceId();
      const limit = positiveInteger(command.limit, "--limit", 100);
      const offset = Number(command.offset);
      if (!Number.isSafeInteger(offset) || offset < 0) {
        throw usageError("--offset must be a non-negative integer");
      }
      return presentReviews(
        await runEffect(
          client.reviews.queue({
            params: { workspaceId: id },
            query: { limit, offset },
          })
        )
      );
    })
  );

program
  .command("review <post-id>")
  .description("Act on a post review")
  .option("--approve", "Approve the post")
  .option("--reject <reason>", "Reject with a reason")
  .option("--comment <text>", "Add a review comment")
  .option("--submit", "Submit the post for review")
  .option("--withdraw", "Withdraw the review request")
  .option("--new", "Force a new review operation")
  .action((postId, command) =>
    run(async ({ client, workspaceId }) => {
      const actions = [
        command.approve,
        command.reject,
        command.comment,
        command.submit,
        command.withdraw,
      ].filter(Boolean);
      if (actions.length !== 1) {
        throw usageError(
          "Choose exactly one review action: --approve, --reject, --comment, --submit, or --withdraw"
        );
      }
      const payload = command.approve
        ? ({ action: "approve" } as const)
        : command.reject
          ? ({ action: "reject", reason: command.reject } as const)
          : command.comment
            ? ({ action: "comment", comment: command.comment } as const)
            : command.submit
              ? ({ action: "submit" } as const)
              : ({ action: "withdraw" } as const);
      const id = await workspaceId();
      const operation = await prepareOperation({
        command: "review",
        fingerprintValue: { workspaceId: id, postId, payload },
        forceNew: command.new,
      });
      if (operation.resourceId) {
        const previous = await runEffect(
          client.reviews.getForPost({
            params: { workspaceId: id, postId },
          })
        );
        return {
          status: "ok",
          message: previous ? `Review ${previous.status}` : "Review completed",
          summary: { replayed: true },
          data: previous,
          next: [`delulu show ${postId}`, "delulu reviews"],
        };
      }
      const params = { workspaceId: id, postId };
      const result = await runEffect(
        payload.action === "approve"
          ? client.reviews.act({ params, payload })
          : payload.action === "reject"
            ? client.reviews.act({ params, payload })
            : payload.action === "comment"
              ? client.reviews.act({ params, payload })
              : payload.action === "submit"
                ? client.reviews.act({ params, payload })
                : client.reviews.act({ params, payload })
      );
      await completeOperation(operation.operationId, postId);
      return {
        status: "ok",
        message: `Review ${result.status}`,
        data: {
          id: result.id,
          post: result.postId,
          state: result.status,
          action: payload.action,
        },
        next: [`delulu show ${postId}`, "delulu reviews"],
      };
    })
  );

const integrate = program
  .command("integrate")
  .description("Manage agent awareness");
integrate.command("install").action(() =>
  run(async () => ({
    status: "ok",
    message: "Agent awareness installed",
    data: await installIntegration(),
    next: ["delulu"],
  }))
);
integrate.command("status").action(() =>
  run(async () => ({
    status: "ok",
    message: "Agent awareness status",
    data: await integrationStatus(),
    next: ["delulu integrate install", "delulu integrate remove"],
  }))
);
integrate.command("remove").action(() =>
  run(async () => ({
    status: "ok",
    message: "Agent awareness removed",
    data: await removeIntegration(),
    next: ["delulu integrate install"],
  }))
);

program
  .command("help [command]")
  .description("Show concise command help")
  .action((name) =>
    run(async () => {
      const target = name
        ? program.commands.find((command) => command.name() === name)
        : program;
      if (!target) {
        throw usageError(`Unknown command: ${name}`, ["delulu help"]);
      }
      return {
        status: "ok",
        message: name ? `Help for ${name}` : "Delulu commands",
        data: name
          ? {
              usage: `delulu ${target.name()} ${target.usage()}`.trim(),
              purpose: target.description(),
              options: target.options.map((option) => ({
                flags: option.flags,
                description: option.description,
                required: option.mandatory,
              })),
              examples: helpExamples[name] ?? [],
              resultFields: ["status", "message", "summary", "data", "next"],
              exitCodes,
            }
          : program.commands
              .filter((command) => !legacyCommands[command.name()])
              .map((command) => ({
                command: command.name(),
                purpose: command.description(),
              })),
        ...(name
          ? {}
          : {
              summary: {
                resultFields: "status, message, summary, data, next",
                exitCodes,
              },
            }),
        next: name ? [`delulu help ${name}`] : ["delulu"],
      };
    })
  );

const legacyCommands: Readonly<Record<string, string>> = {
  whoami: "delulu",
  workspaces: "delulu workspace",
  setup: "delulu",
  billing: "delulu usage or delulu subscribe",
  media: "delulu upload",
  stats: "delulu usage",
};
for (const [legacy, replacement] of Object.entries(legacyCommands)) {
  program
    .command(`${legacy} [args...]`, { hidden: true })
    .allowUnknownOption(true)
    .action(() =>
      run(async () => {
        throw usageError(
          `The ${legacy} command was removed. Use ${replacement}.`,
          [replacement.split(" or ")[0] as string]
        );
      })
    );
}

program
  .parseAsync(process.argv)
  .then(async () => {
    await reportInvocation(commandSucceeded);
    await shutdownTelemetry();
  })
  .catch(async (cause) => {
    if (
      cause instanceof CommanderError &&
      (cause.code === "commander.helpDisplayed" ||
        cause.code === "commander.version")
    ) {
      await shutdownTelemetry();
      return;
    }
    commandSucceeded = false;
    const error =
      cause instanceof CommanderError
        ? new CliError({
            code: "INVALID_USAGE",
            message: cause.message,
            exitCode: 2,
            next: ["delulu help"],
          })
        : classifyError(cause);
    let mode: ReturnType<typeof resolveOutputMode> = "toon";
    try {
      mode = resolveOutputMode(options());
    } catch {
      mode = process.stdout.isTTY ? "pretty" : "toon";
    }
    process.stderr.write(`${formatError(error, mode, options().full)}\n`);
    process.exitCode = error.exitCode;
    await reportInvocation(false);
    await shutdownTelemetry();
  });
