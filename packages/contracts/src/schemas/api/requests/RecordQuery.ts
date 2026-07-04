import { Schema } from "effect";
import { PositiveInteger } from "../../components/PositiveInteger.ts";

export const RecordQuery = Schema.Struct({
  cursor: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Opaque pagination cursor returned by a previous record response.",
    }),
  ),
  from: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional source snapshot or projection identifier." }),
  ),
  limit: Schema.optional(PositiveInteger).pipe(
    Schema.annotateKey({ description: "Maximum number of records to return." }),
  ),
  recordType: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional linked record type filter." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Filters and pagination options for linked records.",
    identifier: "@cycle/contracts/RecordQuery",
    title: "RecordQuery",
  }),
);
export type RecordQuery = typeof RecordQuery.Type;
