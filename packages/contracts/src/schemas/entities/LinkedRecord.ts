import { Schema } from "effect";
import { Actor } from "../components/Actor.ts";

export const LinkedRecord = Schema.Struct({
  createdAt: Schema.String.pipe(
    Schema.annotateKey({ description: "ISO timestamp when the linked record was created." }),
  ),
  createdBy: Actor.pipe(
    Schema.annotateKey({ description: "Actor that created the linked record." }),
  ),
  createdDate: Schema.String.pipe(
    Schema.annotateKey({ description: "Date string used by legacy projections." }),
  ),
  id: Schema.String.pipe(Schema.annotateKey({ description: "Stable linked record id." })),
  issueId: Schema.String.pipe(
    Schema.annotateKey({ description: "Issue id that owns the record." }),
  ),
  payload: Schema.Unknown.pipe(
    Schema.annotateKey({
      description: "Record payload. Shape is record-type-owned and intentionally opaque.",
    }),
  ),
  recordType: Schema.String.pipe(Schema.annotateKey({ description: "Linked record type." })),
  schemaVersion: Schema.Literal(1).pipe(
    Schema.annotateKey({ description: "Schema version for the linked record." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Public linked record attached to an issue.",
    identifier: "@cycle/contracts/LinkedRecord",
    title: "LinkedRecord",
  }),
);
export type LinkedRecord = typeof LinkedRecord.Type;
