import { Schema } from "effect";
import { UnknownRecord } from "../../components/UnknownRecord.ts";

export const UpdateDraftInput = Schema.Struct({
  body: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Replacement markdown body." }),
  ),
  draftId: Schema.String.pipe(Schema.annotateKey({ description: "Draft id to update." })),
  frontmatter: Schema.optional(UnknownRecord).pipe(
    Schema.annotateKey({
      description: "Frontmatter patch. Values are producer-owned extension data.",
    }),
  ),
  status: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Updated draft status." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Patch for an editable issue draft.",
    identifier: "@cycle/contracts/UpdateDraftInput",
    title: "UpdateDraftInput",
  }),
);
export type UpdateDraftInput = typeof UpdateDraftInput.Type;
