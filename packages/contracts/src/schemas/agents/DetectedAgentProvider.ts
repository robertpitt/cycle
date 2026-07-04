import { Schema } from "effect";
import { JsonObject } from "../components/JsonObject.ts";
import { NonNegativeInteger } from "../components/NonNegativeInteger.ts";
import { PositiveInteger } from "../components/PositiveInteger.ts";
import { AgentCapabilities } from "./AgentCapabilities.ts";
import { AgentProviderId } from "./AgentProviderId.ts";
import { AgentReasoningEffort } from "./AgentReasoningEffort.ts";

export const DetectedAgentProvider = Schema.Struct({
  activeRunCount: Schema.optional(NonNegativeInteger).pipe(
    Schema.annotateKey({ description: "Number of active provider runs at detection time." }),
  ),
  capabilities: Schema.optional(AgentCapabilities).pipe(
    Schema.annotateKey({
      description: "Optional capability summary when the provider can be interrogated.",
    }),
  ),
  configuration: Schema.optional(JsonObject).pipe(
    Schema.annotateKey({
      description: "Provider configuration values safe to expose through the app boundary.",
    }),
  ),
  configurationSchema: Schema.optional(JsonObject).pipe(
    Schema.annotateKey({
      description: "JSON schema or schema-like provider configuration description.",
    }),
  ),
  configuredExecutablePath: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "User-configured executable override, when present." }),
  ),
  detectedAt: Schema.String.pipe(
    Schema.annotateKey({ description: "ISO timestamp when detection ran." }),
  ),
  defaultModel: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({ description: "Default provider model, or null when explicitly unset." }),
  ),
  defaultReasoningEffortId: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({
      description: "Default reasoning effort id, or null when explicitly unset.",
    }),
  ),
  executable: Schema.String.pipe(
    Schema.annotateKey({ description: "Executable name used for detection." }),
  ),
  executablePath: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Resolved executable path, when discovery succeeded." }),
  ),
  id: AgentProviderId.pipe(Schema.annotateKey({ description: "Provider id." })),
  maxConcurrentRuns: Schema.optional(Schema.NullOr(PositiveInteger)).pipe(
    Schema.annotateKey({
      description: "Provider concurrency limit, or null when unlimited or unknown.",
    }),
  ),
  message: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Optional human-readable availability or diagnostic message.",
    }),
  ),
  models: Schema.optional(Schema.Array(Schema.String)).pipe(
    Schema.annotateKey({ description: "Model ids reported by the provider." }),
  ),
  name: Schema.String.pipe(Schema.annotateKey({ description: "Human-readable provider name." })),
  packageName: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Optional package name used to install or discover the provider.",
    }),
  ),
  reasoningEfforts: Schema.optional(Schema.Array(AgentReasoningEffort)).pipe(
    Schema.annotateKey({ description: "Reasoning effort options supported by the provider." }),
  ),
  status: Schema.Literals(["available", "missing", "degraded", "disabled", "unsupported"]).pipe(
    Schema.annotateKey({ description: "Detection availability status." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Raw provider detection result reported by the desktop agent subsystem.",
    identifier: "@cycle/contracts/DetectedAgentProvider",
    title: "DetectedAgentProvider",
  }),
);
export type DetectedAgentProvider = typeof DetectedAgentProvider.Type;
