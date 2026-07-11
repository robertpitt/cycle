import { Schema } from "effect";
import { Actor } from "../components/Actor.ts";
import { CycleResourceRef } from "../components/CycleResourceRef.ts";
import { IsoDateTimeString } from "../components/IsoDateTimeString.ts";
import { NonEmptyTrimmedString } from "../components/NonEmptyTrimmedString.ts";

export const CommentDocument = Schema.Struct({
  body: NonEmptyTrimmedString.pipe(Schema.annotateKey({ description: "Markdown comment body." })),
  bodyFormat: Schema.Literal("markdown").pipe(
    Schema.annotateKey({ description: "Comment body format." }),
  ),
  createdAt: IsoDateTimeString.pipe(
    Schema.annotateKey({ description: "Timestamp when the comment was created." }),
  ),
  createdBy: Actor.pipe(Schema.annotateKey({ description: "Actor that created the comment." })),
  id: NonEmptyTrimmedString.pipe(Schema.annotateKey({ description: "Stable comment id." })),
  repositoryId: NonEmptyTrimmedString.pipe(
    Schema.annotateKey({ description: "Repository containing the target and comment." }),
  ),
  schemaVersion: Schema.Literal(1).pipe(
    Schema.annotateKey({ description: "Encoded comment schema version." }),
  ),
  target: CycleResourceRef.pipe(
    Schema.annotateKey({ description: "Typed Cycle resource receiving the comment." }),
  ),
})
  .check(
    Schema.makeFilter(
      (value) =>
        value.repositoryId === value.target.repositoryId ||
        "Comment repository must match target repository",
    ),
  )
  .pipe(
    Schema.annotate({
      description: "An append-only Markdown comment targeting a typed Cycle resource.",
      identifier: "@cycle/contracts/CommentDocument",
      title: "CommentDocument",
    }),
  );
export type CommentDocument = typeof CommentDocument.Type;
