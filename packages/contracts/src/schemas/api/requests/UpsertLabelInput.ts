import { Schema } from "effect";

export const UpsertLabelInput = Schema.Struct({
  color: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional display color." }),
  ),
  description: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({ description: "Optional label description, or null to clear." }),
  ),
  id: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Optional existing label id. When omitted, a new label may be created.",
    }),
  ),
  name: Schema.String.pipe(Schema.annotateKey({ description: "Label display name." })),
}).pipe(
  Schema.annotate({
    description: "Payload for creating or updating a label definition.",
    identifier: "@cycle/contracts/UpsertLabelInput",
    title: "UpsertLabelInput",
  }),
);
export type UpsertLabelInput = typeof UpsertLabelInput.Type;
