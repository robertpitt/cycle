import { Schema } from "effect";

export class StoreNotFoundError extends Schema.TaggedErrorClass<StoreNotFoundError>(
  "@cycle/git-db/StoreNotFoundError",
)("StoreNotFoundError", {
  gitDir: Schema.String,
  message: Schema.String,
}) {}

export const storeNotFound = (gitDir: string): StoreNotFoundError =>
  new StoreNotFoundError({ gitDir, message: `Git directory not found: ${gitDir}` });
