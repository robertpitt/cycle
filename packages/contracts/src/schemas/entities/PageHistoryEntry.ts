import { Schema } from "effect";
import { Actor } from "../components/Actor.ts";
import { IsoDateTimeString } from "../components/IsoDateTimeString.ts";
import { PagePath } from "../components/PagePath.ts";
import { StringList } from "../components/StringList.ts";

export const PageHistoryEntry = Schema.Struct({
  actor: Actor.pipe(Schema.annotateKey({ description: "Actor attributed to the Page event." })),
  committedAt: IsoDateTimeString.pipe(
    Schema.annotateKey({ description: "Timestamp of the Page commit." }),
  ),
  message: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Commit message when available." }),
  ),
  operation: Schema.Literals(["page.create", "page.replace", "page.archive", "page.restore"]).pipe(
    Schema.annotateKey({ description: "Page lifecycle operation." }),
  ),
  parentIds: StringList.pipe(Schema.annotateKey({ description: "Parent snapshot ids." })),
  path: PagePath.pipe(Schema.annotateKey({ description: "Page path at this revision." })),
  snapshotId: Schema.String.pipe(
    Schema.annotateKey({ description: "Snapshot produced by the Page commit." }),
  ),
}).pipe(
  Schema.annotate({
    description: "One Page-specific lifecycle history entry.",
    identifier: "@cycle/contracts/PageHistoryEntry",
    title: "PageHistoryEntry",
  }),
);
export type PageHistoryEntry = typeof PageHistoryEntry.Type;
