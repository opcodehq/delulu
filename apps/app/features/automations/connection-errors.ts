const EXPIRED_CREDENTIAL =
  /access token.*(?:expired|reconnect)|session has expired/i;
const INSTAGRAM_API_ERROR = /^Instagram API error \(\d+\):\s*/;

/** Recognize structured token errors and the legacy Instagram Graph response. */
export function requiresInstagramReconnect(error: Error): boolean {
  if ("code" in error && error.code === "TOKEN_EXPIRED") {
    return true;
  }
  if (EXPIRED_CREDENTIAL.test(error.message)) {
    return true;
  }
  if (!INSTAGRAM_API_ERROR.test(error.message)) {
    return false;
  }
  try {
    const body = JSON.parse(error.message.replace(INSTAGRAM_API_ERROR, ""));
    return body?.error?.code === 190;
  } catch {
    return false;
  }
}
