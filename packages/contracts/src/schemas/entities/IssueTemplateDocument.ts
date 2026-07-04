import { Schema } from "effect";
import { Actor } from "../components/Actor.ts";
import { IssueTemplateKind } from "../components/IssueTemplateKind.ts";
import { StringList } from "../components/StringList.ts";
import { UnknownRecord } from "../components/UnknownRecord.ts";
import { IssueTemplateDefaults } from "./IssueTemplateDefaults.ts";

export const IssueTemplateDocument = Schema.StructWithRest(
  Schema.Struct({
    active: Schema.Boolean.pipe(
      Schema.annotateKey({ description: "Whether the template is available for use." }),
    ),
    bodyTemplate: Schema.String.pipe(
      Schema.annotateKey({ description: "Markdown body template." }),
    ),
    childTemplates: Schema.optional(StringList).pipe(
      Schema.annotateKey({ description: "Optional child template ids." }),
    ),
    createdAt: Schema.String.pipe(
      Schema.annotateKey({ description: "ISO timestamp when the template was created." }),
    ),
    createdBy: Actor.pipe(Schema.annotateKey({ description: "Actor that created the template." })),
    defaults: Schema.optional(IssueTemplateDefaults).pipe(
      Schema.annotateKey({ description: "Default issue fields applied by this template." }),
    ),
    description: Schema.optional(Schema.String).pipe(
      Schema.annotateKey({ description: "Optional template description." }),
    ),
    id: Schema.String.pipe(Schema.annotateKey({ description: "Stable template id." })),
    kind: IssueTemplateKind.pipe(Schema.annotateKey({ description: "Template category." })),
    name: Schema.String.pipe(Schema.annotateKey({ description: "Template display name." })),
    schemaVersion: Schema.Literal(1).pipe(
      Schema.annotateKey({ description: "Schema version for the template document." }),
    ),
    titleTemplate: Schema.String.pipe(Schema.annotateKey({ description: "Issue title template." })),
    updatedAt: Schema.String.pipe(
      Schema.annotateKey({ description: "ISO timestamp when the template last changed." }),
    ),
  }),
  [UnknownRecord],
).pipe(
  Schema.annotate({
    description: "Public issue template document.",
    identifier: "@cycle/contracts/IssueTemplateDocument",
    title: "IssueTemplateDocument",
  }),
);
export type IssueTemplateDocument = typeof IssueTemplateDocument.Type;
