import { expect, it } from "vitest";
import { parseChannelGrant } from "./channel-grant";

it.each([
  undefined,
  null,
  "",
  " ",
  "id",
  "id:",
  ":generation",
  "id:g:extra",
  "id:g:",
])("rejects an absent or malformed grant %s", (grant) => {
  expect(() => parseChannelGrant(grant as string)).toThrow();
});
it("parses a bound identity and generation", () => {
  expect(parseChannelGrant("identity:generation")).toEqual({
    id: "identity",
    generation: "generation",
  });
});
