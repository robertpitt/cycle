import { Schema } from "effect";
import { NonEmptyTrimmedString } from "../../components/NonEmptyTrimmedString.ts";
import { PageId } from "../../components/PageId.ts";

export const PageRevisionInput = Schema.Struct({
  pageId: PageId.pipe(Schema.annotateKey({ description: "Stable Page id to reconstruct." })),
  snapshotId: NonEmptyTrimmedString.pipe(
    Schema.annotateKey({ description: "Reachable snapshot containing the desired revision." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Request for one Page revision at a reachable snapshot.",
    identifier: "@cycle/contracts/PageRevisionInput",
    title: "PageRevisionInput",
  }),
);
export type PageRevisionInput = typeof PageRevisionInput.Type;
