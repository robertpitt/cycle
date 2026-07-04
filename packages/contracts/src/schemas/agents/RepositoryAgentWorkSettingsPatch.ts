import { Schema } from "effect";
import { ConcurrencyLimit } from "../components/ConcurrencyLimit.ts";
import { JsonObject } from "../components/JsonObject.ts";

export const RepositoryAgentWorkSettingsPatch = Schema.Struct({
  agentWorkDisabled: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({
      description: "When present, enables or disables Agent Work for the repository.",
    }),
  ),
  maxConcurrentJobs: Schema.optional(ConcurrencyLimit).pipe(
    Schema.annotateKey({
      description: "When present, updates or clears the repository concurrency cap.",
    }),
  ),
  model: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({
      description: "When present, updates or clears the repository default model.",
    }),
  ),
  paused: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({ description: "When present, pauses or resumes new repository jobs." }),
  ),
  perAgentOverrides: Schema.optional(JsonObject).pipe(
    Schema.annotateKey({
      description: "When present, replaces provider- or agent-specific repository overrides.",
    }),
  ),
  providerId: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({
      description: "When present, updates or clears the repository default provider.",
    }),
  ),
}).pipe(
  Schema.annotate({
    description:
      "Partial update payload for repository Agent Work settings. Unknown keys are rejected.",
    identifier: "@cycle/contracts/RepositoryAgentWorkSettingsPatch",
    parseOptions: { onExcessProperty: "error" } as const,
    title: "RepositoryAgentWorkSettingsPatch",
  }),
);
export type RepositoryAgentWorkSettingsPatch = typeof RepositoryAgentWorkSettingsPatch.Type;
