import { Schema } from "effect";
import { IsoDateTimeString } from "../components/IsoDateTimeString.ts";
import { NonEmptyTrimmedString } from "../components/NonEmptyTrimmedString.ts";
import { PageId } from "../components/PageId.ts";
import { PagePath } from "../components/PagePath.ts";

const PageSummaryStruct = Schema.Struct({
  archived: Schema.Boolean.pipe(
    Schema.annotateKey({ description: "Whether the Page is archived." }),
  ),
  archivedAt: Schema.optional(IsoDateTimeString).pipe(
    Schema.annotateKey({ description: "Archive timestamp when archived." }),
  ),
  createdAt: IsoDateTimeString.pipe(
    Schema.annotateKey({ description: "Timestamp of Page creation." }),
  ),
  id: PageId.pipe(Schema.annotateKey({ description: "Stable Page id." })),
  path: PagePath.pipe(Schema.annotateKey({ description: "Current Page path." })),
  repositoryId: NonEmptyTrimmedString.pipe(
    Schema.annotateKey({ description: "Repository containing the Page." }),
  ),
  revisionId: NonEmptyTrimmedString.pipe(
    Schema.annotateKey({ description: "Latest Page-state revision." }),
  ),
  title: NonEmptyTrimmedString.pipe(Schema.annotateKey({ description: "Page title." })),
  updatedAt: IsoDateTimeString.pipe(
    Schema.annotateKey({ description: "Timestamp of the latest Page-state mutation." }),
  ),
});

export const PageSummary = PageSummaryStruct.check(
  Schema.makeFilter<typeof PageSummaryStruct.Type>(
    (value) =>
      value.archived === (value.archivedAt !== undefined) ||
      "archive flag and timestamp must agree",
  ),
).pipe(
  Schema.annotate({
    description: "Body-free Page metadata for lists, hierarchy nodes, and conflict responses.",
    identifier: "@cycle/contracts/PageSummary",
    title: "PageSummary",
  }),
);
export type PageSummary = typeof PageSummary.Type;
