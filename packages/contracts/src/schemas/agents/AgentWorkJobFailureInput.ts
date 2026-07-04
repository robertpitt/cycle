import { Schema } from "effect";

export const AgentWorkJobFailureInput = Schema.Struct({
  actor: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional actor or subsystem reporting the failure." }),
  ),
  code: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional machine-readable failure code." }),
  ),
  message: Schema.String.pipe(
    Schema.annotateKey({ description: "Human-readable failure message." }),
  ),
  remediation: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional suggested recovery action." }),
  ),
  retrySafe: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({ description: "Whether retrying the job is expected to be safe." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Payload for recording an Agent Work job failure.",
    identifier: "@cycle/contracts/AgentWorkJobFailureInput",
    title: "AgentWorkJobFailureInput",
  }),
);
export type AgentWorkJobFailureInput = typeof AgentWorkJobFailureInput.Type;
