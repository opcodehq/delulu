import { createHash } from "node:crypto";
import { ConflictError } from "@delulu/contracts";
import { Context, Effect, Layer } from "effect";

export interface R2ObjectMetadata {
  readonly size: number;
  readonly contentType: string;
}

const TRAILING_SLASH = /\/$/;

export class R2Config extends Context.Service<
  R2Config,
  {
    readonly accountId: string;
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly bucket: string;
    readonly publicBaseUrl: string;
  }
>()("@delulu/services/R2Config") {}

const hex = (value: ArrayBuffer): string =>
  Array.from(new Uint8Array(value), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
const sha256 = async (value: string): Promise<string> =>
  hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
const hmac = async (key: ArrayBuffer, value: string): Promise<ArrayBuffer> => {
  const imported = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", imported, new TextEncoder().encode(value));
};
const signingKey = async (
  secret: string,
  date: string
): Promise<ArrayBuffer> => {
  let key = new TextEncoder().encode(`AWS4${secret}`).buffer as ArrayBuffer;
  key = await hmac(key, date);
  key = await hmac(key, "auto");
  key = await hmac(key, "s3");
  return hmac(key, "aws4_request");
};

export class R2Service extends Context.Service<
  R2Service,
  {
    readonly configured: boolean;
    readonly presignPut: (key: string) => Effect.Effect<string, ConflictError>;
    readonly presignVerifiedPut: (
      key: string,
      input: { readonly contentType: string }
    ) => Effect.Effect<
      {
        readonly url: string;
        readonly headers: Readonly<Record<string, string>>;
      },
      ConflictError
    >;
    readonly presignGet: (key: string) => Effect.Effect<string, ConflictError>;
    readonly head: (
      key: string
    ) => Effect.Effect<R2ObjectMetadata, ConflictError>;
    readonly hashSha256: (key: string) => Effect.Effect<string, ConflictError>;
    readonly remove: (key: string) => Effect.Effect<void, ConflictError>;
    readonly publicUrl: (key: string) => string;
  }
>()("@delulu/services/R2Service") {
  static readonly layer = Layer.effect(
    R2Service,
    Effect.gen(function* () {
      const config = yield* R2Config;
      const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;
      const presign = (
        method: "GET" | "PUT",
        key: string,
        requestHeaders: Readonly<Record<string, string>> = {}
      ) =>
        Effect.tryPromise({
          try: async () => {
            const now = new Date();
            const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
            const date = amzDate.slice(0, 8);
            const scope = `${date}/auto/s3/aws4_request`;
            const uri = `/${config.bucket}/${key}`;
            const headers = { host: new URL(endpoint).host, ...requestHeaders };
            const signedHeaders = Object.keys(headers).sort().join(";");
            const canonicalHeaders = Object.entries(headers)
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([name, value]) => `${name}:${value.trim()}\n`)
              .join("");
            const query = [
              "X-Amz-Algorithm=AWS4-HMAC-SHA256",
              `X-Amz-Credential=${encodeURIComponent(`${config.accessKeyId}/${scope}`)}`,
              `X-Amz-Date=${amzDate}`,
              "X-Amz-Expires=3600",
              `X-Amz-SignedHeaders=${encodeURIComponent(signedHeaders)}`,
            ].join("&");
            const canonical = [
              method,
              uri,
              query,
              canonicalHeaders,
              signedHeaders,
              "UNSIGNED-PAYLOAD",
            ].join("\n");
            const toSign = [
              "AWS4-HMAC-SHA256",
              amzDate,
              scope,
              await sha256(canonical),
            ].join("\n");
            const signature = hex(
              await hmac(await signingKey(config.secretAccessKey, date), toSign)
            );
            return `${endpoint}${uri}?${query}&X-Amz-Signature=${signature}`;
          },
          catch: () =>
            new ConflictError({
              message: `Unable to sign R2 ${method === "PUT" ? "upload" : "download"}`,
              resource: "workspace-file",
            }),
        });
      const signedRequest = (method: "HEAD" | "DELETE", key: string) =>
        Effect.tryPromise({
          try: async () => {
            const now = new Date();
            const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
            const date = amzDate.slice(0, 8);
            const scope = `${date}/auto/s3/aws4_request`;
            const uri = `/${config.bucket}/${key}`;
            const host = new URL(endpoint).host;
            const payloadHash = await sha256("");
            const headers = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
            const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
            const canonical = [
              method,
              uri,
              "",
              headers,
              signedHeaders,
              payloadHash,
            ].join("\n");
            const toSign = [
              "AWS4-HMAC-SHA256",
              amzDate,
              scope,
              await sha256(canonical),
            ].join("\n");
            const signature = hex(
              await hmac(await signingKey(config.secretAccessKey, date), toSign)
            );
            return fetch(`${endpoint}${uri}`, {
              method,
              headers: {
                "x-amz-date": amzDate,
                "x-amz-content-sha256": payloadHash,
                authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
              },
            });
          },
          catch: () =>
            new ConflictError({
              message: `Unable to ${method.toLowerCase()} R2 object`,
              resource: "media",
            }),
        });
      const head = (key: string) =>
        signedRequest("HEAD", key).pipe(
          Effect.flatMap((response) =>
            response.ok
              ? Effect.succeed({
                  size: Number(response.headers.get("content-length") ?? 0),
                  contentType:
                    response.headers.get("content-type") ??
                    "application/octet-stream",
                })
              : Effect.fail(
                  new ConflictError({
                    message: `R2 object is unavailable (${response.status})`,
                    resource: "media",
                  })
                )
          )
        );
      const remove = (key: string) =>
        signedRequest("DELETE", key).pipe(
          Effect.flatMap((response) =>
            response.ok || response.status === 404
              ? Effect.void
              : Effect.fail(
                  new ConflictError({
                    message: `R2 deletion failed (${response.status})`,
                    resource: "media",
                  })
                )
          )
        );
      return R2Service.of({
        configured: Boolean(
          config.accountId && config.accessKeyId && config.secretAccessKey
        ),
        presignPut: (key) => presign("PUT", key),
        presignVerifiedPut: (key, input) => {
          const headers = {
            "content-type": input.contentType,
          };
          return presign("PUT", key, headers).pipe(
            Effect.map((url) => ({ url, headers }))
          );
        },
        presignGet: (key) => presign("GET", key),
        head,
        hashSha256: (key) =>
          presign("GET", key).pipe(
            Effect.flatMap((url) =>
              Effect.tryPromise({
                try: async () => {
                  const response = await fetch(url);
                  if (!(response.ok && response.body)) {
                    throw new Error("Object is unavailable");
                  }
                  const hash = createHash("sha256");
                  const reader = response.body.getReader();
                  for (;;) {
                    const chunk = await reader.read();
                    if (chunk.done) {
                      break;
                    }
                    hash.update(chunk.value);
                  }
                  return hash.digest("hex");
                },
                catch: () =>
                  new ConflictError({
                    message: "Unable to verify R2 object integrity",
                    resource: "workspace-file",
                  }),
              })
            )
          ),
        remove,
        publicUrl: (key) =>
          `${config.publicBaseUrl.replace(TRAILING_SLASH, "")}/${key}`,
      });
    })
  );
}
