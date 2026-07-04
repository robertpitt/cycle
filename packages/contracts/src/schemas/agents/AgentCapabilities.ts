import { Schema } from "effect";
import { AgentFeatureSupport } from "./AgentFeatureSupport.ts";
import { AgentProviderId } from "./AgentProviderId.ts";
import { AgentWorkJobType } from "./AgentWorkJobType.ts";

export const AgentCapabilities = Schema.Struct({
  provider: AgentProviderId.pipe(
    Schema.annotateKey({ description: "Provider id these capabilities describe." }),
  ),
  sessionPersistence: Schema.Literals(["application", "provider-local", "provider-server"]).pipe(
    Schema.annotateKey({ description: "Where provider conversation state is persisted." }),
  ),
  streaming: Schema.Boolean.pipe(
    Schema.annotateKey({ description: "Whether provider responses can stream incrementally." }),
  ),
  structuredOutput: Schema.Boolean.pipe(
    Schema.annotateKey({
      description: "Whether the provider can return schema-constrained output.",
    }),
  ),
  supportedJobTypes: Schema.Array(AgentWorkJobType).pipe(
    Schema.annotateKey({ description: "Agent work categories accepted by this provider." }),
  ),
  supports: AgentFeatureSupport.pipe(
    Schema.annotateKey({ description: "Fine-grained provider feature flags." }),
  ),
  workspace: Schema.Literals(["none", "read", "write", "provider-defined"]).pipe(
    Schema.annotateKey({ description: "Workspace access model the provider supports." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Capability summary for an agent provider.",
    identifier: "@cycle/contracts/AgentCapabilities",
    title: "AgentCapabilities",
  }),
);
export type AgentCapabilities = typeof AgentCapabilities.Type;
