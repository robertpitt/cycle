import { Schema } from "effect";

export class ConsistencyError extends Schema.TaggedErrorClass<ConsistencyError>(
  "@cycle/database/ConsistencyError",
)("ConsistencyError", {
  cause: Schema.optional(Schema.Defect()),
  command: Schema.String,
  committedSnapshotId: Schema.String,
  message: Schema.String,
  objectId: Schema.optional(Schema.String),
  previousSnapshotId: Schema.NullOr(Schema.String),
  repositoryId: Schema.String,
}) {}
