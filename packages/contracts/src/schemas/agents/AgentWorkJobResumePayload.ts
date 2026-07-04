import { Schema } from "effect";

export const AgentWorkJobResumePayload = Schema.Struct({
  requestedBy: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional user or system id requesting resume." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Payload for resuming a suspended Agent Work job. Unknown keys are rejected.",
    identifier: "@cycle/contracts/AgentWorkJobResumePayload",
    parseOptions: { onExcessProperty: "error" } as const,
    title: "AgentWorkJobResumePayload",
  }),
);
export type AgentWorkJobResumePayload = typeof AgentWorkJobResumePayload.Type;
