import { Schema } from "effect";

export const ReadOptions = Schema.Struct({
  from: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional source snapshot or projection identifier." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Options for reading a resource from a specific projection or snapshot source.",
    identifier: "@cycle/contracts/ReadOptions",
    title: "ReadOptions",
  }),
);
export type ReadOptions = typeof ReadOptions.Type;
