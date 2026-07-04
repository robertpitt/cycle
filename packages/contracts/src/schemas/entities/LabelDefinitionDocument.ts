import { Schema } from "effect";
import { Actor } from "../components/Actor.ts";
import { UnknownRecord } from "../components/UnknownRecord.ts";

export const LabelDefinitionDocument = Schema.StructWithRest(
  Schema.Struct({
    archivedAt: Schema.optional(Schema.String).pipe(
      Schema.annotateKey({ description: "ISO timestamp when the label was archived." }),
    ),
    color: Schema.String.pipe(Schema.annotateKey({ description: "Display color for the label." })),
    createdAt: Schema.String.pipe(
      Schema.annotateKey({ description: "ISO timestamp when the label was created." }),
    ),
    createdBy: Actor.pipe(Schema.annotateKey({ description: "Actor that created the label." })),
    description: Schema.optional(Schema.String).pipe(
      Schema.annotateKey({ description: "Optional label description." }),
    ),
    id: Schema.String.pipe(Schema.annotateKey({ description: "Stable label id." })),
    name: Schema.String.pipe(Schema.annotateKey({ description: "Label display name." })),
    schemaVersion: Schema.Literal(1).pipe(
      Schema.annotateKey({ description: "Schema version for the label document." }),
    ),
    updatedAt: Schema.String.pipe(
      Schema.annotateKey({ description: "ISO timestamp when the label last changed." }),
    ),
  }),
  [UnknownRecord],
).pipe(
  Schema.annotate({
    description: "Public label definition document.",
    identifier: "@cycle/contracts/LabelDefinitionDocument",
    title: "LabelDefinitionDocument",
  }),
);
export type LabelDefinitionDocument = typeof LabelDefinitionDocument.Type;
