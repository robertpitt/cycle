import { Schema } from "effect";
import { PageId } from "../../components/PageId.ts";

export const PageGetInput = Schema.Struct({
  includeArchived: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({ description: "Whether an archived Page may be returned." }),
  ),
  pageId: PageId.pipe(Schema.annotateKey({ description: "Stable Page id to read." })),
}).pipe(
  Schema.annotate({
    description: "Request for one Page by stable id.",
    identifier: "@cycle/contracts/PageGetInput",
    title: "PageGetInput",
  }),
);
export type PageGetInput = typeof PageGetInput.Type;
