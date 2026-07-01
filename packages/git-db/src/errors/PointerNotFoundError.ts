import { Schema } from "effect";

export class PointerNotFoundError extends Schema.TaggedErrorClass<PointerNotFoundError>(
  "@cycle/git-db/PointerNotFoundError",
)("PointerNotFoundError", {
  message: Schema.String,
  pointer: Schema.String,
}) {}
