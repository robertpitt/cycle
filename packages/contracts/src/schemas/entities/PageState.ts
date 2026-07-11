import { Schema } from "effect";
import { NonEmptyTrimmedString } from "../components/NonEmptyTrimmedString.ts";
import { PageId } from "../components/PageId.ts";
import { PagePath } from "../components/PagePath.ts";
import { PageFrontmatter } from "./PageFrontmatter.ts";

export const PageStateFields = {
  body: Schema.String.pipe(Schema.annotateKey({ description: "Markdown Page body." })),
  bodyFormat: Schema.Literal("markdown").pipe(
    Schema.annotateKey({ description: "Page body format." }),
  ),
  frontmatter: PageFrontmatter.pipe(
    Schema.annotateKey({ description: "Canonical Page frontmatter." }),
  ),
  id: PageId.pipe(Schema.annotateKey({ description: "Stable Page id." })),
  path: PagePath.pipe(Schema.annotateKey({ description: "Current user-facing Page path." })),
  repositoryId: NonEmptyTrimmedString.pipe(
    Schema.annotateKey({ description: "Repository containing the Page." }),
  ),
} as const;

const PageStateStruct = Schema.Struct(PageStateFields);

export const PageState = PageStateStruct.check(
  Schema.makeFilter<typeof PageStateStruct.Type>(
    (value) => value.id === value.frontmatter.id || "Page id must match frontmatter id",
  ),
).pipe(
  Schema.annotate({
    description: "Complete event-foldable Page aggregate state without a projected revision id.",
    identifier: "@cycle/contracts/PageState",
    title: "PageState",
  }),
);
export type PageState = typeof PageState.Type;
