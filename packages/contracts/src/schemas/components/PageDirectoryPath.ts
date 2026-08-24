import { Schema, SchemaGetter } from "effect";
import { isPageDirectoryPath, normalizeUnicode } from "../../internal/pageValidation.ts";

export const PageDirectoryPath = Schema.String.pipe(
  Schema.decode({
    decode: SchemaGetter.transform(normalizeUnicode),
    encode: SchemaGetter.transform(normalizeUnicode),
  }),
  Schema.check(
    Schema.makeFilter<string>((value) => isPageDirectoryPath(value) || "a valid Page directory", {
      expected: "an empty root or normalized relative directory path",
    }),
  ),
  Schema.brand("PageDirectoryPath"),
  Schema.annotate({
    description: "A normalized derived Page directory path; an empty string is the root.",
    identifier: "@cycle/contracts/PageDirectoryPath",
    title: "PageDirectoryPath",
  }),
);
export type PageDirectoryPath = typeof PageDirectoryPath.Type;
