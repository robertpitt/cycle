import { Schema } from "effect";
import { NonEmptyTrimmedString } from "../../components/NonEmptyTrimmedString.ts";
import { PageId } from "../../components/PageId.ts";

export const ArchivePageInput = Schema.Struct({
  expectedRevisionId: NonEmptyTrimmedString.pipe(
    Schema.annotateKey({ description: "Expected current Page-specific revision." }),
  ),
  humanApproved: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({
      description: "MCP audit assertion; never authentication or authorization.",
    }),
  ),
  pageId: PageId.pipe(Schema.annotateKey({ description: "Stable Page id to archive." })),
  reason: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional archive reason." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Payload for archiving an active Page at an expected revision.",
    identifier: "@cycle/contracts/ArchivePageInput",
    title: "ArchivePageInput",
  }),
);
export type ArchivePageInput = typeof ArchivePageInput.Type;
