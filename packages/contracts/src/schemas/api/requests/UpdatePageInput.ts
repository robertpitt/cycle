import { Schema } from "effect";
import { hasReservedPageFrontmatterKey } from "../../../internal/pageValidation.ts";
import { NonEmptyTrimmedString } from "../../components/NonEmptyTrimmedString.ts";
import { PageId } from "../../components/PageId.ts";
import { PagePath } from "../../components/PagePath.ts";
import { SafeJsonObject } from "../../components/SafeJsonObject.ts";

const PageFrontmatterExtensionPatch = SafeJsonObject.check(
  Schema.makeFilter(
    (value) =>
      !hasReservedPageFrontmatterKey(value) ||
      "Page frontmatter extension patch must not replace canonical fields",
  ),
);

const UpdatePageStruct = Schema.Struct({
  body: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Complete replacement Markdown body." }),
  ),
  commitMessage: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional save commit message." }),
  ),
  expectedRevisionId: NonEmptyTrimmedString.pipe(
    Schema.annotateKey({ description: "Expected current Page-specific revision." }),
  ),
  frontmatterExtensionPatch: Schema.optional(PageFrontmatterExtensionPatch).pipe(
    Schema.annotateKey({
      description: "Safe extension-key patch; null values request extension removal.",
    }),
  ),
  humanApproved: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({
      description: "MCP audit assertion; never authentication or authorization.",
    }),
  ),
  pageId: PageId.pipe(Schema.annotateKey({ description: "Stable Page id to save." })),
  path: Schema.optional(PagePath).pipe(
    Schema.annotateKey({ description: "Complete replacement Page path for move or rename." }),
  ),
  title: Schema.optional(NonEmptyTrimmedString).pipe(
    Schema.annotateKey({ description: "Complete replacement Page title." }),
  ),
});

export const UpdatePageInput = UpdatePageStruct.check(
  Schema.makeFilter<typeof UpdatePageStruct.Type>(
    (value) =>
      value.body !== undefined ||
      value.frontmatterExtensionPatch !== undefined ||
      value.path !== undefined ||
      value.title !== undefined ||
      "a Page save must replace body, title, path, or extension frontmatter",
  ),
).pipe(
  Schema.annotate({
    description: "Explicit Page save or move guarded by a Page-specific expected revision.",
    identifier: "@cycle/contracts/UpdatePageInput",
    title: "UpdatePageInput",
  }),
);
export type UpdatePageInput = typeof UpdatePageInput.Type;
