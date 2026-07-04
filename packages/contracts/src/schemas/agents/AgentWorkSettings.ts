import { Schema } from "effect";
import { ConcurrencyLimit } from "../components/ConcurrencyLimit.ts";
import { JsonObject } from "../components/JsonObject.ts";
import { AgentWorkAuthorityMode } from "./AgentWorkAuthorityMode.ts";

export const AgentWorkSettings = Schema.Struct({
  allowDisposableWorktreeForMentions: Schema.Boolean.pipe(
    Schema.annotateKey({
      description: "Whether mention-triggered jobs may use disposable worktrees.",
    }),
  ),
  allowFullAccessJobs: Schema.Boolean.pipe(
    Schema.annotateKey({ description: "Whether jobs may request full filesystem access." }),
  ),
  defaultMentionAuthorityMode: AgentWorkAuthorityMode.pipe(
    Schema.annotateKey({ description: "Default authority mode for mention-triggered work." }),
  ),
  defaultModel: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({ description: "Default model id, or null when explicitly unset." }),
  ),
  defaultProviderId: Schema.String.pipe(
    Schema.annotateKey({ description: "Provider id selected for new Agent Work jobs by default." }),
  ),
  enabledProviders: Schema.Array(Schema.String).pipe(
    Schema.annotateKey({ description: "Provider ids enabled for Agent Work." }),
  ),
  maxConcurrentJobs: ConcurrencyLimit.pipe(
    Schema.annotateKey({ description: "Global concurrency limit, or null when unlimited." }),
  ),
  paused: Schema.Boolean.pipe(
    Schema.annotateKey({ description: "Whether new Agent Work jobs should be held." }),
  ),
  perAgentOverrides: JsonObject.pipe(
    Schema.annotateKey({
      description: "Provider- or agent-specific settings preserved as JSON extension data.",
    }),
  ),
}).pipe(
  Schema.annotate({
    description: "Global Agent Work settings.",
    identifier: "@cycle/contracts/AgentWorkSettings",
    title: "AgentWorkSettings",
  }),
);
export type AgentWorkSettings = typeof AgentWorkSettings.Type;
