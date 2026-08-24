import { Schema } from "effect";

export class PageDocumentInvalid extends Schema.TaggedErrorClass<PageDocumentInvalid>(
  "@cycle/contracts/PageDocumentInvalid",
)("PageDocumentInvalid", {
  field: Schema.optional(Schema.String),
  message: Schema.String,
  reason: Schema.String,
}) {}
