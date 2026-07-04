import { Schema } from "effect";
import { ConcurrencyLimit } from "../components/ConcurrencyLimit.ts";
import { JsonObject } from "../components/JsonObject.ts";

export const RepositoryAgentWorkSettings = Schema.Struct({
  agentWorkDisabled: Schema.Boolean.pipe(
    Schema.annotateKey({ description: "Whether Agent Work is disabled for this repository." }),
  ),
  maxConcurrentJobs: ConcurrencyLimit.pipe(
    Schema.annotateKey({
      description: "Repository concurrency limit, or null when no repository cap is configured.",
    }),
  ),
  model: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({
      description: "Repository default model id, or null when explicitly unset.",
    }),
  ),
  paused: Schema.Boolean.pipe(
    Schema.annotateKey({ description: "Whether new jobs for this repository should be held." }),
  ),
  perAgentOverrides: JsonObject.pipe(
    Schema.annotateKey({
      description: "Provider- or agent-specific repository overrides preserved as JSON.",
    }),
  ),
  providerId: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({
      description: "Repository default provider id, or null when explicitly unset.",
    }),
  ),
  repositoryId: Schema.String.pipe(
    Schema.annotateKey({ description: "Repository id these settings apply to." }),
  ),
  updatedAt: Schema.String.pipe(
    Schema.annotateKey({ description: "ISO timestamp when these settings were last changed." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Repository-specific Agent Work settings.",
    identifier: "@cycle/contracts/RepositoryAgentWorkSettings",
    title: "RepositoryAgentWorkSettings",
  }),
);
export type RepositoryAgentWorkSettings = typeof RepositoryAgentWorkSettings.Type;
