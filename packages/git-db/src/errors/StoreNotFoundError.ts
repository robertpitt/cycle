import { Schema } from "effect";

export class StoreNotFoundError extends Schema.TaggedErrorClass<StoreNotFoundError>(
  "@cycle/git-db/StoreNotFoundError",
)("StoreNotFoundError", {
  gitDir: Schema.String,
  message: Schema.String,
}) {}
