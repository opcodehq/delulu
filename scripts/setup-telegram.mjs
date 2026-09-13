import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

// Bot credential stays in the Worker; this command only handles temporary setup credentials.
const origin = process.argv[2];
const environment = process.argv[3];
if (
  !(
    origin &&
    environment &&
    /^https:\/\/[a-z0-9.-]+$/.test(origin) &&
    /^[a-z0-9-]+$/.test(environment)
  )
) {
  throw new Error(
    "Usage: node scripts/setup-telegram.mjs https://worker-host staging"
  );
}
const setupToken = randomBytes(32).toString("hex");
const webhookSecret = randomBytes(32).toString("hex");
const args = ["--filter", "@delulu/http-api", "exec", "wrangler"];
const listed = spawnSync(
  "pnpm",
  [...args, "secret", "list", "--env", environment],
  { encoding: "utf8" }
);
if (listed.status !== 0) {
  throw new Error("Could not inspect existing secret names.");
}
const existing = JSON.parse(listed.stdout);
const secrets = { TELEGRAM_SETUP_TOKEN: setupToken };
if (!existing.some((entry) => entry.name === "TELEGRAM_WEBHOOK_SECRET")) {
  secrets.TELEGRAM_WEBHOOK_SECRET = webhookSecret;
}
const put = spawnSync(
  "pnpm",
  [...args, "secret", "bulk", "--env", environment],
  {
    input: JSON.stringify(secrets),
    encoding: "utf8",
  }
);
if (put.status !== 0) {
  throw new Error(
    "Could not store Telegram setup secrets; check Wrangler authentication."
  );
}
try {
  let response;
  // Secret updates propagate asynchronously to edge locations. Reuse the same credentials.
  for (let attempt = 0; attempt < 10; attempt++) {
    response = await fetch(`${origin}/v1/providers/telegram/setup`, {
      method: "POST",
      headers: { authorization: `Bearer ${setupToken}` },
      signal: AbortSignal.timeout(60_000),
    });
    if (response.status !== 403) {
      break;
    }
    await response.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  const result = response.headers
    .get("content-type")
    ?.includes("application/json")
    ? await response.json()
    : { error: "Setup request rejected" };
  console.log(JSON.stringify({ status: response.status, ...result }));
  if (!response.ok || result.registered !== true) {
    process.exitCode = 1;
  }
} finally {
  const remove = spawnSync(
    "pnpm",
    [...args, "secret", "delete", "TELEGRAM_SETUP_TOKEN", "--env", environment],
    { input: "y\n", encoding: "utf8" }
  );
  if (remove.status !== 0) {
    console.error(
      "Remove TELEGRAM_SETUP_TOKEN manually; setup credential cleanup failed."
    );
    process.exitCode = 1;
  }
}
