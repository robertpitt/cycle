import { Schema } from "effect";
import { LinkedRecord } from "./LinkedRecord.ts";

export const RecordPage = Schema.Struct({
  entries: Schema.Array(LinkedRecord).pipe(
    Schema.annotateKey({ description: "Linked records for the current page." }),
  ),
  nextCursor: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Opaque cursor for the next page, when more results are available.",
    }),
  ),
}).pipe(
  Schema.annotate({
    description: "Paged linked record response.",
    identifier: "@cycle/contracts/RecordPage",
    title: "RecordPage",
  }),
);
export type RecordPage = typeof RecordPage.Type;
