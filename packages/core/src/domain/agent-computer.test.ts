import { describe, expect, it } from "vitest";
import {
  canTransitionComputer,
  terminalComputerStates,
} from "./agent-computer";

describe("agent computer lifecycle", () => {
  it("permits operational resume, pause, stop, and recovery transitions", () => {
    expect(canTransitionComputer("provisioning", "paused")).toBe(true);
    expect(canTransitionComputer("paused", "running")).toBe(true);
    expect(canTransitionComputer("running", "pausing")).toBe(true);
    expect(canTransitionComputer("pausing", "paused")).toBe(true);
    expect(canTransitionComputer("failed", "provisioning")).toBe(true);
  });

  it("prevents deleted computers from returning and skips impossible states", () => {
    expect(canTransitionComputer("deleted", "running")).toBe(false);
    expect(canTransitionComputer("paused", "provisioning")).toBe(false);
    expect(canTransitionComputer("running", "deleted")).toBe(false);
    expect(terminalComputerStates.has("deleted")).toBe(true);
  });
});
