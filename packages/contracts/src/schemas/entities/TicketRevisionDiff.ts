import { Schema } from "effect";
import { TicketRevisionDiffFile } from "./TicketRevisionDiffFile.ts";
import { TicketRevisionMetadataChange } from "./TicketRevisionMetadataChange.ts";

export const TicketRevisionDiff = Schema.Struct({
  files: Schema.Array(TicketRevisionDiffFile).pipe(
    Schema.annotateKey({ description: "File content changes between the revisions." }),
  ),
  fromSnapshotId: Schema.String.pipe(Schema.annotateKey({ description: "Older snapshot id." })),
  metadataChanges: Schema.Array(TicketRevisionMetadataChange).pipe(
    Schema.annotateKey({ description: "Frontmatter metadata changes between the revisions." }),
  ),
  ticketId: Schema.String.pipe(Schema.annotateKey({ description: "Ticket id that was diffed." })),
  toSnapshotId: Schema.String.pipe(Schema.annotateKey({ description: "Newer snapshot id." })),
}).pipe(
  Schema.annotate({
    description: "Diff response for one ticket across two snapshots.",
    identifier: "@cycle/contracts/TicketRevisionDiff",
    title: "TicketRevisionDiff",
  }),
);
export type TicketRevisionDiff = typeof TicketRevisionDiff.Type;
