import { Schema, SchemaGetter } from "effect";
import { isPagePath, normalizeUnicode } from "../../internal/pageValidation.ts";

export const PagePath = Schema.String.pipe(
  Schema.decode({
    decode: SchemaGetter.transform(normalizeUnicode),
    encode: SchemaGetter.transform(normalizeUnicode),
  }),
  Schema.check(
    Schema.makeFilter<string>((value) => isPagePath(value) || "a valid Page path", {
      expected: "a normalized relative path ending in lowercase .md",
    }),
  ),
  Schema.brand("PagePath"),
  Schema.annotate({
    description: "A normalized repository-relative user-facing Markdown Page path.",
    identifier: "@cycle/contracts/PagePath",
    title: "PagePath",
  }),
);
export type PagePath = typeof PagePath.Type;
