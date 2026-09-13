import { Schema } from "effect";
import {
  HttpApiEndpoint,
  HttpApiGroup,
  OpenApi,
} from "effect/unstable/httpapi";

export const DeploymentMode = Schema.Literals(["hosted", "self_hosted"]);
export type DeploymentMode = typeof DeploymentMode.Type;

export const InstanceCapabilities = Schema.Struct({
  deploymentMode: DeploymentMode,
  billingEnabled: Schema.Boolean,
  registrationEnabled: Schema.Boolean,
  agentComputerEnabled: Schema.Boolean,
  workspaceFilesEnabled: Schema.Boolean,
  version: Schema.String,
}).annotate({
  identifier: "InstanceCapabilities",
  description: "Public deployment capabilities used by app and agent clients",
});

export const InstanceGroup = HttpApiGroup.make("instance")
  .add(
    HttpApiEndpoint.get("capabilities", "/v1/instance", {
      success: InstanceCapabilities,
    })
      .annotate(OpenApi.Summary, "Inspect deployment capabilities")
      .annotate(
        OpenApi.Description,
        "Reports deployment, billing, registration, agent computer, workspace file, and version capabilities without requiring authentication."
      )
  )
  .annotate(OpenApi.Title, "Instance");
