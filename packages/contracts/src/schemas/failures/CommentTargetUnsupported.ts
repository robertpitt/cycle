import { Schema } from "effect";

export class CommentTargetUnsupported extends Schema.TaggedErrorClass<CommentTargetUnsupported>(
  "@cycle/contracts/CommentTargetUnsupported",
)("CommentTargetUnsupported", {
  message: Schema.String,
  repositoryId: Schema.String,
  resourceId: Schema.String,
  resourceKind: Schema.String,
}) {}
