import { Schema } from "effect";

export const AgentWorkDelegateInput = Schema.Struct({
  agentId: Schema.String.pipe(
    Schema.annotateKey({ description: "Agent id to assign to the ticket." }),
  ),
  assignedBy: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional assigning user or system id." }),
  ),
  enabled: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({ description: "Optional delegate enabled flag." }),
  ),
  model: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({ description: "Optional model override, or null to clear." }),
  ),
  notes: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({ description: "Optional assignment notes, or null to clear." }),
  ),
  providerId: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional provider override for the delegate." }),
  ),
}).pipe(
  Schema.annotate({
    description:
      "Payload for creating or updating an Agent Work delegate. Unknown keys are rejected.",
    identifier: "@cycle/contracts/AgentWorkDelegateInput",
    parseOptions: { onExcessProperty: "error" } as const,
    title: "AgentWorkDelegateInput",
  }),
);
export type AgentWorkDelegateInput = typeof AgentWorkDelegateInput.Type;
