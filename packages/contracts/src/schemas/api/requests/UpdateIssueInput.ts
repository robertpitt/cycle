import { Schema } from "effect";
import { UnknownRecord } from "../../components/UnknownRecord.ts";

export const UpdateIssueInput = Schema.Struct({
  body: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Replacement markdown body." }),
  ),
  frontmatter: Schema.optional(UnknownRecord).pipe(
    Schema.annotateKey({
      description: "Frontmatter patch. Values are producer-owned extension data.",
    }),
  ),
  message: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional commit or audit message for the update." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Patch for mutable issue body and frontmatter fields.",
    identifier: "@cycle/contracts/UpdateIssueInput",
    title: "UpdateIssueInput",
  }),
);
export type UpdateIssueInput = typeof UpdateIssueInput.Type;
