import { Schema } from "effect";
import { ConcurrencyLimit } from "../components/ConcurrencyLimit.ts";
import { JsonObject } from "../components/JsonObject.ts";
import { AgentWorkAuthorityMode } from "./AgentWorkAuthorityMode.ts";

export const AgentWorkSettingsPatch = Schema.Struct({
  allowDisposableWorktreeForMentions: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({
      description: "When present, updates disposable worktree permission for mentions.",
    }),
  ),
  allowFullAccessJobs: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({
      description: "When present, updates whether full-access jobs may be requested.",
    }),
  ),
  defaultMentionAuthorityMode: Schema.optional(AgentWorkAuthorityMode).pipe(
    Schema.annotateKey({
      description: "When present, updates the mention-triggered authority mode.",
    }),
  ),
  defaultModel: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({ description: "When present, updates or clears the default model id." }),
  ),
  defaultProviderId: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "When present, updates the default provider id." }),
  ),
  enabledProviders: Schema.optional(Schema.Array(Schema.String)).pipe(
    Schema.annotateKey({ description: "When present, replaces the enabled provider id list." }),
  ),
  maxConcurrentJobs: Schema.optional(ConcurrencyLimit).pipe(
    Schema.annotateKey({
      description: "When present, updates or clears the global concurrency cap.",
    }),
  ),
  paused: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({ description: "When present, pauses or resumes new Agent Work jobs." }),
  ),
  perAgentOverrides: Schema.optional(JsonObject).pipe(
    Schema.annotateKey({
      description: "When present, replaces provider- or agent-specific JSON overrides.",
    }),
  ),
}).pipe(
  Schema.annotate({
    description:
      "Partial update payload for global Agent Work settings. Unknown keys are rejected.",
    identifier: "@cycle/contracts/AgentWorkSettingsPatch",
    parseOptions: { onExcessProperty: "error" } as const,
    title: "AgentWorkSettingsPatch",
  }),
);
export type AgentWorkSettingsPatch = typeof AgentWorkSettingsPatch.Type;
