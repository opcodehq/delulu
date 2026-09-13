import { expect, it } from "vitest";
import { makeBaseLayer, makePgLayer } from "./base-layer";

it("loads shared API composition in Node without mocking Worker-only modules", () => {
  expect(makeBaseLayer).toBeTypeOf("function");
  expect(makePgLayer).toBeTypeOf("function");
});
