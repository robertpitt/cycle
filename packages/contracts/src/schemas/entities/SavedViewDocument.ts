import { Schema } from "effect";
import { IssueQuery } from "../api/requests/IssueQuery.ts";
import { Actor } from "../components/Actor.ts";
import { SavedViewDisplay } from "../components/SavedViewDisplay.ts";
import { SavedViewGroupBy } from "../components/SavedViewGroupBy.ts";
import { SavedViewKind } from "../components/SavedViewKind.ts";
import { SavedViewSort } from "../components/SavedViewSort.ts";
import { UnknownRecord } from "../components/UnknownRecord.ts";

export const SavedViewDocument = Schema.StructWithRest(
  Schema.Struct({
    builtIn: Schema.optional(Schema.Boolean).pipe(
      Schema.annotateKey({ description: "Whether the view is built in and system-owned." }),
    ),
    createdAt: Schema.String.pipe(
      Schema.annotateKey({ description: "ISO timestamp when the view was created." }),
    ),
    createdBy: Actor.pipe(Schema.annotateKey({ description: "Actor that created the view." })),
    description: Schema.optional(Schema.String).pipe(
      Schema.annotateKey({ description: "Optional saved-view description." }),
    ),
    display: Schema.optional(SavedViewDisplay).pipe(
      Schema.annotateKey({ description: "Optional display preferences." }),
    ),
    groupBy: SavedViewGroupBy.pipe(
      Schema.annotateKey({ description: "Grouping mode used by the view." }),
    ),
    id: Schema.String.pipe(Schema.annotateKey({ description: "Stable saved-view id." })),
    kind: SavedViewKind.pipe(
      Schema.annotateKey({ description: "Presentation mode for the view." }),
    ),
    name: Schema.String.pipe(Schema.annotateKey({ description: "Saved-view display name." })),
    ownerUserId: Schema.optional(Schema.String).pipe(
      Schema.annotateKey({ description: "Optional user id that owns the view." }),
    ),
    pinned: Schema.Boolean.pipe(
      Schema.annotateKey({ description: "Whether the view should be pinned in clients." }),
    ),
    query: IssueQuery.pipe(
      Schema.annotateKey({ description: "Issue query captured by the view." }),
    ),
    repositoryScope: Schema.optional(Schema.Literal("current-repository")).pipe(
      Schema.annotateKey({ description: "Optional repository scoping behavior for clients." }),
    ),
    schemaVersion: Schema.Literal(1).pipe(
      Schema.annotateKey({ description: "Schema version for the saved-view document." }),
    ),
    sort: Schema.optional(SavedViewSort).pipe(
      Schema.annotateKey({ description: "Optional sort settings." }),
    ),
    updatedAt: Schema.String.pipe(
      Schema.annotateKey({ description: "ISO timestamp when the view last changed." }),
    ),
  }),
  [UnknownRecord],
).pipe(
  Schema.annotate({
    description: "Public saved view document.",
    identifier: "@cycle/contracts/SavedViewDocument",
    title: "SavedViewDocument",
  }),
);
export type SavedViewDocument = typeof SavedViewDocument.Type;
