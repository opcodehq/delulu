import { Schema } from "effect";

export const AgentComputerState = Schema.Literals([
  "provisioning",
  "running",
  "pausing",
  "paused",
  "stopping",
  "stopped",
  "failed",
  "deleted",
]);
export type AgentComputerState = typeof AgentComputerState.Type;

export const AgentTaskStatus = Schema.Literals([
  "queued",
  "planning",
  "waiting_for_permission",
  "provisioning",
  "running",
  "waiting_for_input",
  "checkpointing",
  "completed",
  "cancelling",
  "cancelled",
  "failed",
  "timed_out",
]);
export type AgentTaskStatus = typeof AgentTaskStatus.Type;

export const AgentProcessStatus = Schema.Literals([
  "starting",
  "running",
  "completed",
  "failed",
  "stopping",
  "stopped",
]);
export type AgentProcessStatus = typeof AgentProcessStatus.Type;

export const AgentNetworkPolicy = Schema.Literals([
  "none",
  "packages",
  "public_network",
  "approved_domains",
]);
export type AgentNetworkPolicy = typeof AgentNetworkPolicy.Type;

const transitions: Readonly<
  Record<AgentComputerState, ReadonlySet<AgentComputerState>>
> = {
  provisioning: new Set(["running", "paused", "failed", "deleted"]),
  running: new Set(["pausing", "stopping", "failed"]),
  pausing: new Set(["paused", "running", "failed"]),
  paused: new Set(["running", "stopping", "failed", "deleted"]),
  stopping: new Set(["stopped", "failed"]),
  stopped: new Set(["provisioning", "running", "deleted"]),
  failed: new Set(["provisioning", "stopping", "deleted"]),
  deleted: new Set(),
};

export const terminalComputerStates: ReadonlySet<AgentComputerState> = new Set([
  "deleted",
]);

export const canTransitionComputer = (
  from: AgentComputerState,
  to: AgentComputerState
): boolean => transitions[from].has(to);
