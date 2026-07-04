import { Schema } from "effect";
import { PositiveInteger } from "../../components/PositiveInteger.ts";

export const LabelDefinitionQuery = Schema.Struct({
  archived: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({ description: "Optional archived-state filter." }),
  ),
  cursor: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Opaque pagination cursor returned by a previous label response.",
    }),
  ),
  limit: Schema.optional(PositiveInteger).pipe(
    Schema.annotateKey({ description: "Maximum number of labels to return." }),
  ),
  text: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional text search over label names and descriptions." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Filters and pagination options for label definitions.",
    identifier: "@cycle/contracts/LabelDefinitionQuery",
    title: "LabelDefinitionQuery",
  }),
);
export type LabelDefinitionQuery = typeof LabelDefinitionQuery.Type;
