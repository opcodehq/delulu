import { spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePrepared } from "./runtime.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const buildRoot = join(root, ".build", "cloudflare-os");
const config = JSON.parse(
  await readFile(join(root, "deployment.json"), "utf8")
);

const required = [
  "accountId",
  "workshopWorker",
  "contentGatekeeperWorker",
  "contextWorker",
  "schedulerWorker",
  "apiWorker",
];
for (const key of required) {
  if (!config[key] || String(config[key]).includes("<")) {
    throw new Error(`deployment.json requires ${key}`);
  }
}
if (!/^[a-f\d]{32}$/i.test(config.accountId)) {
  throw new Error(
    "accountId must be a 32-character hexadecimal Cloudflare account ID"
  );
}

const run = (args, cwd = root) => {
  const result = spawnSync(
    "corepack",
    ["pnpm", "--pm-on-fail=ignore", ...args],
    {
      cwd,
      stdio: "inherit",
    }
  );
  if (result.status !== 0) {
    throw new Error(`pnpm ${args.join(" ")} failed`);
  }
};

if (!process.argv.includes("--reuse-build")) {
  run(["install:runtime"]);
}
await validatePrepared();

const common = {
  account_id: config.accountId,
  workers_dev: false,
  observability: {
    enabled: true,
    head_sampling_rate: 1,
    logs: { invocation_logs: false },
    traces: { enabled: true, head_sampling_rate: 0.1 },
  },
};
const contextConfig = {
  ...common,
  name: config.contextWorker,
  main: ".wrangler/validate/src/index.ts",
  build: {
    command: "pnpm exec capnweb-validate build --out .wrangler/validate",
    watch_dir: "src",
  },
  compatibility_date: "2026-02-02",
  compatibility_flags: ["nodejs_compat", "allow_irrevocable_stub_storage"],
  migrations: [
    {
      tag: "v0",
      new_sqlite_classes: [
        "ContextCollectionDurableObject",
        "UserLibraryDurableObject",
        "LibraryRegistryDurableObject",
        "ContextGatekeeper",
      ],
    },
  ],
  kv_namespaces: [{ binding: "CONTEXT_COLLECTIONS" }],
};
const contentConfig = {
  ...common,
  name: config.contentGatekeeperWorker,
  main: ".wrangler/validate/src/index.ts",
  build: {
    command: "pnpm exec capnweb-validate build --out .wrangler/validate",
    watch_dir: "src",
  },
  compatibility_date: "2026-08-04",
  compatibility_flags: ["allow_irrevocable_stub_storage", "nodejs_compat"],
  migrations: [{ tag: "v0", new_sqlite_classes: ["ContentGatekeeper"] }],
  services: [
    {
      binding: "CONTENT_API",
      service: config.apiWorker,
      entrypoint: "AgentContentBridge",
    },
  ],
};
const schedulerConfig = {
  ...common,
  name: config.schedulerWorker,
  main: ".wrangler/validate/src/worker.ts",
  compatibility_date: "2026-02-02",
  compatibility_flags: ["allow_irrevocable_stub_storage", "nodejs_als"],
  rules: [{ type: "Text", globs: ["**/*.txt"], fallthrough: false }],
  migrations: [
    {
      tag: "v1",
      new_sqlite_classes: ["ScheduleDriver", "SchedulerGatekeeper"],
    },
  ],
};
const workshopConfig = {
  ...common,
  name: config.workshopWorker,
  main: ".wrangler/validate/src/server.ts",
  compatibility_date: "2026-02-02",
  compatibility_flags: [
    "allow_irrevocable_stub_storage",
    "enhanced_error_serialization",
    "global_fetch_strictly_public",
    "nodejs_compat",
  ],
  vars: {
    ADMINS: [],
    DISABLE_PASSWORD_AUTH: "true",
    CF_AI_GATEWAY: config.aiGateway.name,
    CF_AI_GATEWAY_ACCOUNT_ID: config.accountId,
    CF_AI_GATEWAY_PROVIDERS: "openai",
    OPENAI_VIA_OPENROUTER:
      config.aiGateway.provider === "openrouter" ? "true" : "false",
    EXTERNAL_DEFAULT_MODEL: config.aiGateway.defaultModel,
    EXTERNAL_QUICK_MODEL: config.aiGateway.routineModel,
  },
  ai: { binding: "WORKERS_AI" },
  browser: { binding: "BROWSER", remote: true },
  services: [
    {
      binding: "GATEKEEPER_CONTEXT",
      service: config.contextWorker,
      entrypoint: "GatekeeperVendor",
      props: { sharingDomain: "production" },
    },
    {
      binding: "GATEKEEPER_DELULU",
      service: config.contentGatekeeperWorker,
      entrypoint: "GatekeeperVendor",
    },
    {
      binding: "GATEKEEPER_SCHEDULER",
      service: config.schedulerWorker,
      entrypoint: "GatekeeperVendor",
    },
  ],
  migrations: [
    {
      tag: "v0",
      new_sqlite_classes: ["UserDurableObject", "OverseerDurableObject"],
    },
    { tag: "v1", new_sqlite_classes: ["AdminSettings"] },
    { tag: "v2", new_sqlite_classes: ["PendingLogin"] },
  ],
  kv_namespaces: [{ binding: "BLUEPRINTS" }, { binding: "AVATARS" }],
  r2_buckets: [{ binding: "BLUEPRINT_CONTENT" }],
  worker_loaders: [{ binding: "LOADER" }],
};

const generated = [
  [
    join(buildRoot, "packages/gatekeeper-context/wrangler.delulu.json"),
    contextConfig,
  ],
  [
    join(buildRoot, "packages/delulu-content-gatekeeper/wrangler.delulu.json"),
    contentConfig,
  ],
  [
    join(buildRoot, "packages/gatekeeper-scheduler/wrangler.delulu.json"),
    schedulerConfig,
  ],
  [
    join(buildRoot, "packages/workshop-backend/wrangler.delulu.json"),
    workshopConfig,
  ],
];
for (const [path, value] of generated) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

try {
  run(["--dir", buildRoot, "--filter", "@gadgets/gatekeeper-context", "build"]);
  run(["--dir", buildRoot, "--filter", "@delulu/content-gatekeeper", "build"]);
  run([
    "--dir",
    buildRoot,
    "--filter",
    "@gadgets/gatekeeper-scheduler",
    "build",
  ]);
  const workshopRoot = join(buildRoot, "packages", "workshop-backend");
  run(["run", "build"], workshopRoot);
  run(["run", "build:worker"], workshopRoot);
  for (const filename of [
    "agent-spawner-binding.txt",
    "ai-model-binding.txt",
  ]) {
    await copyFile(
      join(workshopRoot, "src", filename),
      join(workshopRoot, ".wrangler", "validate", "src", filename)
    );
  }
  const schedulerRoot = join(buildRoot, "packages", "gatekeeper-scheduler");
  run(
    ["exec", "capnweb-validate", "build", "--out", ".wrangler/validate"],
    schedulerRoot
  );
  await mkdir(join(schedulerRoot, ".wrangler", "validate", "src"), {
    recursive: true,
  });
  await copyFile(
    join(schedulerRoot, "src", "types.txt"),
    join(schedulerRoot, ".wrangler", "validate", "src", "types.txt")
  );
  const dryRun = process.argv.includes("--dry-run") ? ["--dry-run"] : [];
  for (const [path] of generated) {
    run(
      ["exec", "wrangler", "deploy", "--config", path, ...dryRun],
      dirname(path)
    );
  }
} finally {
  await Promise.all(generated.map(([path]) => rm(path, { force: true })));
}
