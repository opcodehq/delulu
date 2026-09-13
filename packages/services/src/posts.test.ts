import { describe, expect, it } from "vitest";
import {
  decodePostContentForView,
  decodePostTargetSettingsForView,
  postRequiresTarget,
} from "./posts";

describe("decodePostContentForView", () => {
  it("keeps pre-validation drafts with legacy-length group ids readable", () => {
    const content = decodePostContentForView({
      groups: [
        {
          id: "post_group_V2StGXR8_Z5jdHi6B-myW",
          isDefault: true,
          segments: [{ text: "Recovered draft", media: [] }],
        },
      ],
    });

    expect(content.groups[0]?.id).toBe("post_group_V2StGXR8_Z5jdHi6B-myW");
  });
});

describe("decodePostTargetSettingsForView", () => {
  it("fills defaults for directly-seeded targets with incomplete settings", () => {
    expect(
      decodePostTargetSettingsForView({
        platform: "LINKEDIN",
        values: {},
      })
    ).toEqual({
      platform: "LINKEDIN",
      values: { visibility: "PUBLIC" },
    });
  });
});

describe("postRequiresTarget", () => {
  it("allows writing before an account is selected when saving a draft", () => {
    expect(postRequiresTarget("draft")).toBe(false);
    expect(postRequiresTarget("schedule")).toBe(true);
    expect(postRequiresTarget("publish_now")).toBe(true);
    expect(postRequiresTarget(undefined)).toBe(true);
  });
});
