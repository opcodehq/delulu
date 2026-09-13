import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PINNED_REVISION = "c04843f97cd07a8c869312058fc59a00b5d5b5cb";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const upstream = join(root, "upstream");
const buildRoot = join(root, ".build", "cloudflare-os");
const contentGatekeeper = join(root, "content-gatekeeper");
const patchFiles = [
  join(root, "patches", "0001-external-agent-control.patch"),
  join(root, "patches", "0002-content-account-provisioning.patch"),
  join(root, "patches", "0003-disable-password-auth.patch"),
  join(root, "patches", "0004-external-model-policy.patch"),
  join(root, "patches", "0005-openrouter-routing.patch"),
  join(root, "patches", "0006-persistent-response-bindings.patch"),
];

const run = (command, args, cwd = root) => {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with status ${result.status}`
    );
  }
};

const output = (command, args, cwd = root) => {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || `${command} failed`);
  }
  return result.stdout.trim();
};

export const check = () => {
  const revision = output("git", ["rev-parse", "HEAD"], upstream);
  if (revision !== PINNED_REVISION) {
    throw new Error(
      `Runtime revision ${revision} does not match reviewed pin ${PINNED_REVISION}.`
    );
  }
  const dirty = output("git", ["status", "--porcelain"], upstream);
  if (dirty) {
    throw new Error("Pinned runtime submodule must be clean.");
  }
  for (const patchFile of patchFiles) {
    run("git", ["apply", "--recount", "--check", patchFile], upstream);
  }
};

export const validatePrepared = async () => {
  check();
  const revision = await readFile(
    join(buildRoot, "DELULU_RUNTIME_REVISION"),
    "utf8"
  );
  if (revision.trim() !== PINNED_REVISION) {
    throw new Error("Prepared runtime revision is stale; prepare it again.");
  }
  // Reverse checks prove every current patch is actually present, including reuse.
  for (const patchFile of patchFiles) {
    run(
      "git",
      ["apply", "--recount", "--reverse", "--check", patchFile],
      buildRoot
    );
  }
};

export const prepare = async () => {
  check();
  await rm(buildRoot, { recursive: true, force: true });
  await mkdir(dirname(buildRoot), { recursive: true });
  await cp(upstream, buildRoot, {
    recursive: true,
    filter: (source) =>
      !(source.endsWith("/.git") || source.includes("/node_modules/")),
  });
  await cp(
    contentGatekeeper,
    join(buildRoot, "packages", "delulu-content-gatekeeper"),
    {
      recursive: true,
    }
  );
  await cp(
    join(
      buildRoot,
      "packages",
      "gatekeeper-context",
      "worker-configuration.d.ts"
    ),
    join(
      buildRoot,
      "packages",
      "delulu-content-gatekeeper",
      "worker-configuration.d.ts"
    )
  );
  // An independent repository prevents git apply silently skipping paths
  // relative to the enclosing product repository.
  run("git", ["init", "--quiet"], buildRoot);
  for (const patchFile of patchFiles) {
    run("git", ["apply", "--recount", "--verbose", patchFile], buildRoot);
  }
  const gateway = await readFile(
    join(
      buildRoot,
      "packages/workshop-backend/src/external-message-gateway.ts"
    ),
    "utf8"
  );
  const models = await readFile(
    join(buildRoot, "packages/workshop-backend/src/ai-models.ts"),
    "utf8"
  );
  if (
    !(
      gateway.includes("ensureExternalUser") &&
      models.includes("gwConfig.quickModel !== undefined")
    )
  ) {
    throw new Error(
      "Required runtime patches were not applied; refusing to deploy."
    );
  }
  await writeFile(
    join(buildRoot, "DELULU_RUNTIME_REVISION"),
    `${PINNED_REVISION}\n`,
    "utf8"
  );
};

const install = async () => {
  await prepare();
  run(
    "corepack",
    ["pnpm", "--pm-on-fail=ignore", "install", "--no-frozen-lockfile"],
    buildRoot
  );
};

const build = async () => {
  await install();
  run("corepack", ["pnpm", "--pm-on-fail=ignore", "run", "build"], buildRoot);
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const command = process.argv[2] ?? "check";
  if (command === "check") {
    check();
  } else if (command === "prepare") {
    await prepare();
  } else if (command === "install") {
    await install();
  } else if (command === "build") {
    await build();
  } else {
    throw new Error(`Unknown runtime command: ${command}`);
  }
}
