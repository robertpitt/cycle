import { Schema } from "effect";

export const AgentWorkDelegateJobInput = Schema.Struct({
  agentId: Schema.String.pipe(Schema.annotateKey({ description: "Agent id to assign and run." })),
  assignedBy: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional assigning user or system id." }),
  ),
  enabled: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({ description: "Optional delegate enabled flag." }),
  ),
  instructions: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({ description: "Optional job instructions, or null to omit." }),
  ),
  model: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({ description: "Optional model override, or null to clear." }),
  ),
  notes: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({ description: "Optional assignment notes, or null to clear." }),
  ),
  providerId: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional provider override for the delegate and job." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Payload for assigning an agent and starting a job. Unknown keys are rejected.",
    identifier: "@cycle/contracts/AgentWorkDelegateJobInput",
    parseOptions: { onExcessProperty: "error" } as const,
    title: "AgentWorkDelegateJobInput",
  }),
);
export type AgentWorkDelegateJobInput = typeof AgentWorkDelegateJobInput.Type;
