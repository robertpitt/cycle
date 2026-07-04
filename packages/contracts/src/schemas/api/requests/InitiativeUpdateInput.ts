import { Schema } from "effect";

export const InitiativeUpdateInput = Schema.Struct({
  blockers: Schema.optional(Schema.Array(Schema.String)).pipe(
    Schema.annotateKey({ description: "Optional blockers currently affecting the initiative." }),
  ),
  nextSteps: Schema.optional(Schema.Array(Schema.String)).pipe(
    Schema.annotateKey({ description: "Optional next steps for the initiative." }),
  ),
  progressNote: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional detailed progress note." }),
  ),
  status: Schema.Literals(["at-risk", "blocked", "complete", "on-track"]).pipe(
    Schema.annotateKey({ description: "Current initiative health status." }),
  ),
  summary: Schema.String.pipe(Schema.annotateKey({ description: "Short update summary." })),
}).pipe(
  Schema.annotate({
    description: "Payload describing a progress update for an initiative.",
    identifier: "@cycle/contracts/InitiativeUpdateInput",
    title: "InitiativeUpdateInput",
  }),
);
export type InitiativeUpdateInput = typeof InitiativeUpdateInput.Type;
