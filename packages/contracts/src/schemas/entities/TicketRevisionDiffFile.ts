import { Schema } from "effect";

export const TicketRevisionDiffFile = Schema.Struct({
  language: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional language hint for syntax highlighting." }),
  ),
  newContent: Schema.String.pipe(
    Schema.annotateKey({ description: "File content at the newer revision." }),
  ),
  newPath: Schema.String.pipe(
    Schema.annotateKey({ description: "File path at the newer revision." }),
  ),
  oldContent: Schema.String.pipe(
    Schema.annotateKey({ description: "File content at the older revision." }),
  ),
  oldPath: Schema.String.pipe(
    Schema.annotateKey({ description: "File path at the older revision." }),
  ),
}).pipe(
  Schema.annotate({
    description: "File-level content diff between two ticket revisions.",
    identifier: "@cycle/contracts/TicketRevisionDiffFile",
    title: "TicketRevisionDiffFile",
  }),
);
export type TicketRevisionDiffFile = typeof TicketRevisionDiffFile.Type;
