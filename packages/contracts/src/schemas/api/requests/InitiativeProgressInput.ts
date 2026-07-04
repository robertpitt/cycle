import { Schema } from "effect";

export const InitiativeProgressInput = Schema.Struct({
  id: Schema.String.pipe(Schema.annotateKey({ description: "Initiative issue id." })),
}).pipe(
  Schema.annotate({
    description: "Request for initiative progress.",
    identifier: "@cycle/contracts/InitiativeProgressInput",
    title: "InitiativeProgressInput",
  }),
);
export type InitiativeProgressInput = typeof InitiativeProgressInput.Type;
