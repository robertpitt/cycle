import { Schema } from "effect";

export const AgentFeatureSupport = Schema.Struct({
  abort: Schema.Boolean.pipe(
    Schema.annotateKey({ description: "Whether the provider can abort an active run." }),
  ),
  artifacts: Schema.Boolean.pipe(
    Schema.annotateKey({ description: "Whether the provider can produce structured artifacts." }),
  ),
  fileChanges: Schema.Boolean.pipe(
    Schema.annotateKey({ description: "Whether the provider can report file changes." }),
  ),
  mcp: Schema.Boolean.pipe(
    Schema.annotateKey({ description: "Whether the provider can use MCP tools." }),
  ),
  toolEvents: Schema.Boolean.pipe(
    Schema.annotateKey({ description: "Whether the provider emits tool-call lifecycle events." }),
  ),
  usage: Schema.Boolean.pipe(
    Schema.annotateKey({ description: "Whether the provider reports token or usage information." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Provider feature flags used by clients to enable or hide agent controls.",
    identifier: "@cycle/contracts/AgentFeatureSupport",
    title: "AgentFeatureSupport",
  }),
);
export type AgentFeatureSupport = typeof AgentFeatureSupport.Type;
