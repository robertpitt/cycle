import { Schema } from "effect";

export class PagePathInvalid extends Schema.TaggedErrorClass<PagePathInvalid>(
  "@cycle/contracts/PagePathInvalid",
)("PagePathInvalid", {
  message: Schema.String,
  path: Schema.String,
  reason: Schema.String,
}) {}
