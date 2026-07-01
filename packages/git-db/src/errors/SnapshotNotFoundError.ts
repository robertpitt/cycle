import { Schema } from "effect";

export class SnapshotNotFoundError extends Schema.TaggedErrorClass<SnapshotNotFoundError>(
  "@cycle/git-db/SnapshotNotFoundError",
)("SnapshotNotFoundError", {
  message: Schema.String,
  snapshot: Schema.String,
}) {}
