import { Schema } from "effect";
import { CycleResourceRef } from "../components/CycleResourceRef.ts";

export class CommentTargetNotFound extends Schema.TaggedErrorClass<CommentTargetNotFound>(
  "@cycle/contracts/CommentTargetNotFound",
)("CommentTargetNotFound", {
  message: Schema.String,
  target: CycleResourceRef,
}) {}
