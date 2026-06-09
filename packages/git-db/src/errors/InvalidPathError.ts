import { Schema } from "effect";

export class InvalidPathError extends Schema.TaggedErrorClass<InvalidPathError>(
  "@cycle/git-db/InvalidPathError",
)("InvalidPathError", {
  message: Schema.String,
  path: Schema.String,
}) {}

export const invalidPath = (path: string, reason = "invalid store path"): InvalidPathError =>
  new InvalidPathError({ message: `Invalid store path ${path}: ${reason}`, path });
