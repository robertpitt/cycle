import { Schema } from "effect";
import { hasReservedPageFrontmatterKey } from "../../../internal/pageValidation.ts";
import { NonEmptyTrimmedString } from "../../components/NonEmptyTrimmedString.ts";
import { PagePath } from "../../components/PagePath.ts";
import { SafeJsonObject } from "../../components/SafeJsonObject.ts";

const PageCreateExtensions = SafeJsonObject.check(
  Schema.makeFilter(
    (value) =>
      !hasReservedPageFrontmatterKey(value) ||
      "Page frontmatter extension data must not replace canonical fields",
  ),
);

export const CreatePageInput = Schema.Struct({
  body: Schema.String.pipe(Schema.annotateKey({ description: "Initial Markdown Page body." })),
  commitMessage: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional Page create commit message." }),
  ),
  frontmatterExtensions: Schema.optional(PageCreateExtensions).pipe(
    Schema.annotateKey({ description: "Optional safe extension frontmatter." }),
  ),
  humanApproved: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({
      description: "MCP audit assertion; never authentication or authorization.",
    }),
  ),
  path: PagePath.pipe(Schema.annotateKey({ description: "Initial Page path." })),
  title: NonEmptyTrimmedString.pipe(Schema.annotateKey({ description: "Initial Page title." })),
}).pipe(
  Schema.annotate({
    description: "Payload for creating one repository-scoped Markdown Page.",
    identifier: "@cycle/contracts/CreatePageInput",
    title: "CreatePageInput",
  }),
);
export type CreatePageInput = typeof CreatePageInput.Type;
