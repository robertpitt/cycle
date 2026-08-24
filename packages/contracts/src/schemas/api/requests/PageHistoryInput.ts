import { Schema } from "effect";
import { PageId } from "../../components/PageId.ts";
import { HistoryOptions } from "./HistoryOptions.ts";

export const PageHistoryInput = Schema.Struct({
  options: Schema.optional(HistoryOptions).pipe(
    Schema.annotateKey({ description: "History cursor and limit options." }),
  ),
  pageId: PageId.pipe(Schema.annotateKey({ description: "Stable Page id whose history is read." })),
}).pipe(
  Schema.annotate({
    description: "Request for Page lifecycle history across moves and renames.",
    identifier: "@cycle/contracts/PageHistoryInput",
    title: "PageHistoryInput",
  }),
);
export type PageHistoryInput = typeof PageHistoryInput.Type;
