import { Schema } from "effect";

export const AddLinkedRecordInput = Schema.Struct({
  issueId: Schema.String.pipe(
    Schema.annotateKey({ description: "Issue id that owns the record." }),
  ),
  payload: Schema.Unknown.pipe(
    Schema.annotateKey({
      description: "Record payload. Shape is record-type-owned and intentionally opaque.",
    }),
  ),
  recordType: Schema.String.pipe(Schema.annotateKey({ description: "Linked record type." })),
  userVisible: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({
      description: "Whether the record should be shown as user-visible activity.",
    }),
  ),
}).pipe(
  Schema.annotate({
    description: "Payload for adding a linked record to an issue.",
    identifier: "@cycle/contracts/AddLinkedRecordInput",
    title: "AddLinkedRecordInput",
  }),
);
export type AddLinkedRecordInput = typeof AddLinkedRecordInput.Type;
