import { Schema } from "effect";
import { NonEmptyTrimmedString } from "../../components/NonEmptyTrimmedString.ts";
import { PageId } from "../../components/PageId.ts";

export const RestorePageInput = Schema.Struct({
  expectedRevisionId: NonEmptyTrimmedString.pipe(
    Schema.annotateKey({ description: "Expected current Page-specific revision." }),
  ),
  humanApproved: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({
      description: "MCP audit assertion; never authentication or authorization.",
    }),
  ),
  pageId: PageId.pipe(Schema.annotateKey({ description: "Stable Page id to restore." })),
  reason: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional restore reason." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Payload for restoring an archived Page at an expected revision.",
    identifier: "@cycle/contracts/RestorePageInput",
    title: "RestorePageInput",
  }),
);
export type RestorePageInput = typeof RestorePageInput.Type;
