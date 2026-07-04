import { Schema } from "effect";
import { IssueTemplateKind } from "../../components/IssueTemplateKind.ts";
import { PositiveInteger } from "../../components/PositiveInteger.ts";

export const IssueTemplateQuery = Schema.Struct({
  active: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({ description: "Optional active-state filter." }),
  ),
  cursor: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Opaque pagination cursor returned by a previous template response.",
    }),
  ),
  kind: Schema.optional(IssueTemplateKind).pipe(
    Schema.annotateKey({ description: "Optional template kind filter." }),
  ),
  limit: Schema.optional(PositiveInteger).pipe(
    Schema.annotateKey({ description: "Maximum number of templates to return." }),
  ),
  text: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Optional text search over template names and descriptions.",
    }),
  ),
}).pipe(
  Schema.annotate({
    description: "Filters and pagination options for issue templates.",
    identifier: "@cycle/contracts/IssueTemplateQuery",
    title: "IssueTemplateQuery",
  }),
);
export type IssueTemplateQuery = typeof IssueTemplateQuery.Type;
