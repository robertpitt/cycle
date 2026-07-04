import { Schema } from "effect";

export const AgentReasoningEffort = Schema.Struct({
  description: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Optional provider-facing description shown in configuration UI.",
    }),
  ),
  disabled: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({
      description: "Whether the option should be hidden or disabled for new runs.",
    }),
  ),
  id: Schema.String.pipe(
    Schema.annotateKey({ description: "Stable reasoning effort id passed to the provider." }),
  ),
  label: Schema.String.pipe(
    Schema.annotateKey({ description: "Short display label for the effort option." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Provider-specific reasoning effort option.",
    identifier: "@cycle/contracts/AgentReasoningEffort",
    title: "AgentReasoningEffort",
  }),
);
export type AgentReasoningEffort = typeof AgentReasoningEffort.Type;
