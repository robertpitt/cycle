import { Schema } from "effect";

export const UnknownRecord = Schema.Record(Schema.String, Schema.Unknown).pipe(
  Schema.annotate({
    description:
      "A string-keyed object whose values are intentionally owned by a downstream adapter.",
    identifier: "@cycle/contracts/UnknownRecord",
    title: "UnknownRecord",
  }),
);
export type UnknownRecord = typeof UnknownRecord.Type;
