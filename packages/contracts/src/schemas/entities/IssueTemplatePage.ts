import { Schema } from "effect";
import { IssueTemplateDocument } from "./IssueTemplateDocument.ts";

export const IssueTemplatePage = Schema.Struct({
  entries: Schema.Array(IssueTemplateDocument).pipe(
    Schema.annotateKey({ description: "Issue templates for the current page." }),
  ),
  nextCursor: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Opaque cursor for the next page, when more results are available.",
    }),
  ),
}).pipe(
  Schema.annotate({
    description: "Paged issue template response.",
    identifier: "@cycle/contracts/IssueTemplatePage",
    title: "IssueTemplatePage",
  }),
);
export type IssueTemplatePage = typeof IssueTemplatePage.Type;
