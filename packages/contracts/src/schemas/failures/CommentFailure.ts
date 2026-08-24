import { Schema } from "effect";
import { CommentTargetNotFound } from "./CommentTargetNotFound.ts";
import { CommentTargetUnsupported } from "./CommentTargetUnsupported.ts";

export const CommentFailure = Schema.Union([CommentTargetNotFound, CommentTargetUnsupported]).pipe(
  Schema.annotate({
    description: "Recoverable generic comment target failures.",
    identifier: "@cycle/contracts/CommentFailure",
    title: "CommentFailure",
  }),
);
export type CommentFailure = typeof CommentFailure.Type;
