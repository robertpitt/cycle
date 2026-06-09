import { Schema } from "effect";

export class SnapshotNotFoundError extends Schema.TaggedErrorClass<SnapshotNotFoundError>(
  "@cycle/git-db/SnapshotNotFoundError",
)("SnapshotNotFoundError", {
  message: Schema.String,
  snapshot: Schema.String,
}) {}

export const snapshotNotFound = (snapshot: string): SnapshotNotFoundError =>
  new SnapshotNotFoundError({ message: `Snapshot not found: ${snapshot}`, snapshot });
