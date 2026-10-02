// Run against an agent-browser session's `get cdp-url` output. No production auth.
import { writeFile } from "node:fs/promises";

const [endpoint, origin, output] = process.argv.slice(2);
if (!(endpoint && origin && output)) {
  throw new Error(
    "Usage: node benchmark.mjs <cdp-websocket> <origin> <output.json>"
  );
}
const ws = new WebSocket(endpoint);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});
let id = 0;
const calls = new Map();
ws.addEventListener("message", ({ data }) => {
  const message = JSON.parse(String(data));
  const pending = calls.get(message.id);
  if (!pending) {
    return;
  }
  calls.delete(message.id);
  if (message.error) {
    pending.reject(new Error(JSON.stringify(message.error)));
  } else {
    pending.resolve(message.result);
  }
});
function send(method, params, sessionId) {
  return new Promise((resolve, reject) => {
    const requestId = ++id;
    calls.set(requestId, { resolve, reject });
    ws.send(JSON.stringify({ id: requestId, method, params, sessionId }));
  });
}
let sessionId;
try {
  const { targetInfos } = await send("Target.getTargets", {});
  const target = targetInfos.find(
    (t) => t.type === "page" && t.url.startsWith(origin)
  );
  if (!target) {
    throw new Error(`No page open at ${origin}`);
  }
  ({ sessionId } = await send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: true,
  }));
  await send("Emulation.setCPUThrottlingRate", { rate: 4 }, sessionId);
  const { result, exceptionDetails } = await send(
    "Runtime.evaluate",
    {
      expression: `(async () => {
    const tasks = [];
    const observer = new PerformanceObserver(list => tasks.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration }))));
    observer.observe({ type: "longtask" });
    const timings = await window.runNavigationBenchmark(10);
    observer.disconnect();
    return { timings, longTasks: tasks, javascriptDecodedBytes: performance.getEntriesByType("resource").filter(e => e.initiatorType === "script").reduce((total, e) => total + e.decodedBodySize, 0), requests: window.fixtureRequests };
  })()`,
      awaitPromise: true,
      returnByValue: true,
    },
    sessionId
  );
  if (exceptionDetails) {
    throw new Error(JSON.stringify(exceptionDetails));
  }
  await writeFile(
    output,
    JSON.stringify(
      {
        cpuSlowdown: 4,
        fixtureLatencyMs: 150,
        runs: 10,
        runtime:
          "Vite development harness; warm modules, fresh app state per run",
        ...result.value,
      },
      null,
      2
    ) + "\n"
  );
  console.log(`Saved ${output}`);
} finally {
  if (sessionId) {
    await send("Emulation.setCPUThrottlingRate", { rate: 1 }, sessionId);
  }
  ws.close();
}
