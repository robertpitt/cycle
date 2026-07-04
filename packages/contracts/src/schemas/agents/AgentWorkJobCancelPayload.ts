import { Schema } from "effect";

export const AgentWorkJobCancelPayload = Schema.Struct({
  reason: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional cancellation reason." }),
  ),
  requestedBy: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional user or system id requesting cancellation." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Payload for requesting Agent Work job cancellation. Unknown keys are rejected.",
    identifier: "@cycle/contracts/AgentWorkJobCancelPayload",
    parseOptions: { onExcessProperty: "error" } as const,
    title: "AgentWorkJobCancelPayload",
  }),
);
export type AgentWorkJobCancelPayload = typeof AgentWorkJobCancelPayload.Type;
