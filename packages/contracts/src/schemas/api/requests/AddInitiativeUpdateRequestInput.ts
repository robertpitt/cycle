import { Schema } from "effect";
import { InitiativeUpdateInput } from "./InitiativeUpdateInput.ts";

export const AddInitiativeUpdateRequestInput = Schema.Struct({
  id: Schema.String.pipe(Schema.annotateKey({ description: "Initiative issue id." })),
  update: InitiativeUpdateInput.pipe(
    Schema.annotateKey({ description: "Initiative update payload." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Request for adding an initiative progress update.",
    identifier: "@cycle/contracts/AddInitiativeUpdateRequestInput",
    title: "AddInitiativeUpdateRequestInput",
  }),
);
export type AddInitiativeUpdateRequestInput = typeof AddInitiativeUpdateRequestInput.Type;
