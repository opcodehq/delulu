import { describe, expect, it } from "vitest";
import {
  socialConnectionProgressCopy,
  socialSuccessCopy,
} from "./social-success";

describe("socialSuccessCopy", () => {
  it("includes provider, username, and CLI completion guidance", () => {
    expect(
      socialSuccessCopy({
        provider: "twitter",
        username: "swarajb",
        client: "cli",
      })
    ).toEqual({
      title: "Twitter connected",
      message: "@swarajb is now connected and ready to use.",
      detail:
        "You have successfully authenticated with the Delulu CLI. You can close this window and return to your terminal.",
    });
  });

  it("omits CLI guidance for browser-initiated connections", () => {
    expect(
      socialSuccessCopy({
        provider: "youtube",
        username: "@delulu",
        client: null,
      })
    ).toEqual({
      title: "YouTube connected",
      message: "@delulu is now connected and ready to use.",
      detail: undefined,
    });
  });

  it("does not format provider display names as handles", () => {
    expect(
      socialSuccessCopy({
        provider: "linkedin",
        username: "Jane Doe",
        client: null,
      }).message
    ).toBe("Jane Doe is now connected and ready to use.");
  });

  it("explains that a successful authorization is still syncing", () => {
    expect(
      socialConnectionProgressCopy({ provider: "linkedin", status: "syncing" })
    ).toEqual({
      title: "Finishing LinkedIn connection",
      message:
        "Your authorization succeeded. We’re refreshing Connected Accounts now.",
    });
  });
});
