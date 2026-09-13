import { ProviderUnavailableError } from "@delulu/contracts";
import type { AgentNetworkPolicy } from "@delulu/core";
import { Context, Effect, Layer } from "effect";

export interface ExecutionWorkspace {
  readonly id: string;
  readonly state: "running" | "paused" | "stopped";
}

export interface ExecutionResult {
  readonly exitCode: number;
  readonly output: string;
  readonly outputTruncated: boolean;
}

export interface ProvisionWorkspaceInput {
  readonly computerId: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly networkPolicy: AgentNetworkPolicy;
  readonly approvedDomains?: readonly string[];
}

export interface ExecuteWorkspaceInput {
  readonly workspaceId: string;
  readonly command: string;
  readonly workingDirectory?: string;
  readonly environment?: Readonly<Record<string, string>>;
  readonly timeoutSeconds: number;
}

export const MAX_COMMAND_OUTPUT_BYTES = 32 * 1024;

export const boundCommandOutput = (
  value: string,
  limit = MAX_COMMAND_OUTPUT_BYTES
): { readonly output: string; readonly truncated: boolean } => {
  const bytes = new TextEncoder().encode(value);
  if (bytes.byteLength <= limit) {
    return { output: value, truncated: false };
  }
  const suffix: string[] = [];
  let suffixBytes = 0;
  const characters = Array.from(value);
  for (let index = characters.length - 1; index >= 0; index--) {
    const character = characters[index];
    if (!character) {
      continue;
    }
    const characterBytes = new TextEncoder().encode(character).byteLength;
    if (suffixBytes + characterBytes > limit) {
      break;
    }
    suffix.push(character);
    suffixBytes += characterBytes;
  }
  return {
    output: suffix.reverse().join(""),
    truncated: true,
  };
};

export class ExecutionWorkspaceProvider extends Context.Service<
  ExecutionWorkspaceProvider,
  {
    readonly provision: (
      input: ProvisionWorkspaceInput
    ) => Effect.Effect<ExecutionWorkspace, ProviderUnavailableError>;
    readonly resume: (
      workspaceId: string
    ) => Effect.Effect<void, ProviderUnavailableError>;
    readonly pause: (
      workspaceId: string
    ) => Effect.Effect<void, ProviderUnavailableError>;
    readonly destroy: (
      workspaceId: string
    ) => Effect.Effect<void, ProviderUnavailableError>;
    readonly execute: (
      input: ExecuteWorkspaceInput
    ) => Effect.Effect<ExecutionResult, ProviderUnavailableError>;
    readonly snapshot: (
      workspaceId: string,
      name: string
    ) => Effect.Effect<string, ProviderUnavailableError>;
  }
>()("@delulu/services/ExecutionWorkspaceProvider") {
  static memoryLayer(): Layer.Layer<ExecutionWorkspaceProvider> {
    const workspaces = new Map<string, ExecutionWorkspace["state"]>();
    return Layer.succeed(
      ExecutionWorkspaceProvider,
      ExecutionWorkspaceProvider.of({
        provision: (input) => {
          const id = `memory-${input.computerId}`;
          workspaces.set(id, "running");
          return Effect.succeed({ id, state: "running" as const });
        },
        resume: (id) =>
          Effect.sync(() => {
            workspaces.set(id, "running");
          }),
        pause: (id) =>
          Effect.sync(() => {
            workspaces.set(id, "paused");
          }),
        destroy: (id) =>
          Effect.sync(() => {
            workspaces.delete(id);
          }),
        execute: (input) => {
          if (workspaces.get(input.workspaceId) !== "running") {
            return Effect.fail(
              new ProviderUnavailableError({
                message: "Execution workspace is not running",
                provider: "execution-workspace",
                retryable: true,
              })
            );
          }
          const bounded = boundCommandOutput(input.command);
          return Effect.succeed({
            exitCode: 0,
            output: bounded.output,
            outputTruncated: bounded.truncated,
          });
        },
        snapshot: (_id, name) => Effect.succeed(`memory-snapshot-${name}`),
      })
    );
  }
}
