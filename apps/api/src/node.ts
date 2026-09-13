import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { Readable } from "node:stream";
import { buildWebHandler } from "./app";
import { makeBaseLayer } from "./base-layer";
import { appOrigins, type Env } from "./env";
import { runMaintenance } from "./maintenance";

const required = [
  "DATABASE_URL",
  "SCHEDULER_URL",
  "SCHEDULER_SECRET",
  "CLERK_ISSUER",
  "CLERK_JWT_KEY",
  "CLERK_SECRET_KEY",
  "AS_SIGNING_KEY_BASE64",
  "ENCRYPTION_SECRET",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
] as const;

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(
    `Missing required self-host configuration: ${missing.join(", ")}`
  );
}

const env = process.env as unknown as Env;
const layer = makeBaseLayer(env);
const { handler, dispose } = buildWebHandler(layer, {
  allowedOrigins: appOrigins(env),
});
const webHandler = handler as unknown as (
  request: Request
) => Promise<Response>;

const toRequest = (request: IncomingMessage): Request => {
  const origin = `http://${request.headers.host ?? "localhost"}`;
  const method = request.method ?? "GET";
  return new Request(new URL(request.url ?? "/", origin), {
    method,
    headers: request.headers as HeadersInit,
    body:
      method === "GET" || method === "HEAD"
        ? undefined
        : (Readable.toWeb(request) as ReadableStream),
    duplex: method === "GET" || method === "HEAD" ? undefined : "half",
  } as RequestInit);
};

const send = async (response: Response, target: ServerResponse) => {
  target.statusCode = response.status;
  response.headers.forEach((value, name) => target.setHeader(name, value));
  if (!response.body) {
    return target.end();
  }
  Readable.fromWeb(response.body as never).pipe(target);
};

const server = createServer(async (request, response) => {
  try {
    await send(await webHandler(toRequest(request)), response);
  } catch (error) {
    console.error(error);
    response.statusCode = 500;
    response.end("Internal Server Error");
  }
});

let maintenanceRun: Promise<void> | undefined;
const maintenance = setInterval(() => {
  if (!maintenanceRun) {
    maintenanceRun = runMaintenance(layer)
      .catch(console.error)
      .finally(() => {
        maintenanceRun = undefined;
      });
  }
}, 60_000);
maintenance.unref();

const shutdown = async (signal: string) => {
  clearInterval(maintenance);
  await maintenanceRun;
  console.log(`Received ${signal}; shutting down`);
  server.closeIdleConnections();
  await new Promise<void>((resolve) => {
    const force = setTimeout(() => {
      server.closeAllConnections();
    }, 25_000);
    server.close((error) => {
      clearTimeout(force);
      if (error) {
        console.error(error);
      }
      resolve();
    });
  });
  await dispose();
  process.exitCode = 0;
};
process.once("SIGINT", () => shutdown("SIGINT").catch(console.error));
process.once("SIGTERM", () => shutdown("SIGTERM").catch(console.error));

server.listen(Number(process.env.PORT ?? 8787), "0.0.0.0", () => {
  console.log(`Delulu API listening on :${process.env.PORT ?? "8787"}`);
});
