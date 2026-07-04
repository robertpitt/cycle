import { Schema } from "effect";
import { JsonObject } from "../components/JsonObject.ts";
import { NonNegativeInteger } from "../components/NonNegativeInteger.ts";
import { PositiveInteger } from "../components/PositiveInteger.ts";
import { AgentCapabilities } from "./AgentCapabilities.ts";
import { AgentHarnessStatus } from "./AgentHarnessStatus.ts";
import { AgentProviderId } from "./AgentProviderId.ts";
import { AgentReasoningEffort } from "./AgentReasoningEffort.ts";

export const AgentProviderProfile = Schema.Struct({
  activeRunCount: Schema.optional(NonNegativeInteger).pipe(
    Schema.annotateKey({ description: "Number of active runs known for this provider." }),
  ),
  capabilities: AgentCapabilities.pipe(
    Schema.annotateKey({ description: "Normalized capability summary for the provider." }),
  ),
  checkedAt: Schema.String.pipe(
    Schema.annotateKey({ description: "ISO timestamp when the profile was last checked." }),
  ),
  configurationSchema: Schema.optional(JsonObject).pipe(
    Schema.annotateKey({
      description: "JSON schema or schema-like provider configuration description.",
    }),
  ),
  configuration: JsonObject.pipe(
    Schema.annotateKey({
      description: "Provider configuration values safe to expose through the app boundary.",
    }),
  ),
  configuredExecutablePath: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "User-configured executable override, when present." }),
  ),
  defaultModel: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({
      description: "Default model selected for new runs, or null when explicitly unset.",
    }),
  ),
  defaultReasoningEffortId: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({
      description: "Default reasoning effort id, or null when explicitly unset.",
    }),
  ),
  displayName: Schema.String.pipe(
    Schema.annotateKey({ description: "Human-readable provider name shown in clients." }),
  ),
  executableName: Schema.String.pipe(
    Schema.annotateKey({ description: "Executable name expected by the provider harness." }),
  ),
  executablePath: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Resolved executable path, when discovery succeeded." }),
  ),
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
  models: Schema.Array(Schema.String).pipe(
    Schema.annotateKey({ description: "Available model ids for this provider." }),
  ),
  packageName: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Optional package name used to install or discover the provider.",
    }),
  ),
  provider: AgentProviderId.pipe(Schema.annotateKey({ description: "Provider id." })),
  reasoningEfforts: Schema.optional(Schema.Array(AgentReasoningEffort)).pipe(
    Schema.annotateKey({ description: "Reasoning effort options supported by the provider." }),
  ),
  status: AgentHarnessStatus.pipe(
    Schema.annotateKey({ description: "Availability state for this provider." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Normalized provider profile exposed by Cycle APIs and clients.",
    identifier: "@cycle/contracts/AgentProviderProfile",
    title: "AgentProviderProfile",
  }),
);
export type AgentProviderProfile = typeof AgentProviderProfile.Type;
