import { ConsentClient } from "@/app/oauth/consent/consent-client";

/**
 * First-party OAuth consent screen (#149). The API's `GET /oauth/authorize`
 * validates the request and redirects the browser here with the OAuth params in
 * the query string. This route is Clerk-protected by middleware, so the user is
 * always signed in by the time they land here. On approval the client component
 * calls the API's `POST /oauth/authorize/finalize` with the Clerk session token
 * and follows the returned loopback redirect back to the CLI.
 */

const REQUIRED_PARAMS = [
  "client_id",
  "redirect_uri",
  "code_challenge",
] as const;

// Human-readable names for our first-party public clients.
const CLIENT_NAMES: Record<string, string> = {
  "delulu-cli": "Delulu CLI",
  "delulu-mcp": "Delulu MCP",
};

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const request = {
    responseType: first(params.response_type) ?? "code",
    clientId: first(params.client_id) ?? "",
    redirectUri: first(params.redirect_uri) ?? "",
    scope: first(params.scope) ?? "",
    state: first(params.state) ?? "",
    codeChallenge: first(params.code_challenge) ?? "",
    codeChallengeMethod: first(params.code_challenge_method) ?? "S256",
    resource: first(params.resource) ?? "",
  };

  const missing = REQUIRED_PARAMS.filter((key) => !first(params[key]));
  if (missing.length > 0 || request.responseType !== "code") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="font-semibold text-lg">Invalid authorization request</h1>
        <p className="text-muted-foreground text-sm">
          This authorization request is missing required parameters. Please
          start the login again from your application.
        </p>
      </main>
    );
  }

  return (
    <ConsentClient
      clientName={CLIENT_NAMES[request.clientId] ?? request.clientId}
      request={request}
    />
  );
}
