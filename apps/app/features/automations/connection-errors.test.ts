import { describe, expect, it } from "vitest";
import { requiresInstagramReconnect } from "./connection-errors";

describe("Instagram reconnect errors", () => {
  it.each([
    new Error(
      'Instagram API error (400): {"error":{"code":190,"message":"Invalid OAuth access token."}}'
    ),
    new Error("Access token expired and the account must be reconnected"),
    Object.assign(new Error("Reconnect required"), { code: "TOKEN_EXPIRED" }),
  ])("recognizes invalid credentials: %s", (error) => {
    expect(requiresInstagramReconnect(error)).toBe(true);
  });

  it.each([
    new Error('Instagram API error (400): {"error":{"code":100}}'),
    new Error("Instagram API error (429): rate limited"),
    new Error("Instagram API error (503): unavailable"),
    new Error("Unable to load media"),
    new Error("Instagram API error (400): null"),
  ])("does not ask to reconnect for unrelated failures: %s", (error) => {
    expect(requiresInstagramReconnect(error)).toBe(false);
  });
});
