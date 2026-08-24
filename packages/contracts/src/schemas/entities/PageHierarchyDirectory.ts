import { Schema } from "effect";
import type { PageDirectoryPath as PageDirectoryPathType } from "../components/PageDirectoryPath.ts";
import { PageDirectoryPath } from "../components/PageDirectoryPath.ts";
import { PageSummary } from "./PageSummary.ts";

export interface PageHierarchyDirectory {
  readonly cover?: typeof PageSummary.Type;
  readonly directories: ReadonlyArray<PageHierarchyDirectory>;
  readonly name: string;
  readonly pages: ReadonlyArray<typeof PageSummary.Type>;
  readonly path: PageDirectoryPathType;
}

interface PageHierarchyDirectoryEncoded {
  readonly cover?: typeof PageSummary.Encoded;
  readonly directories: ReadonlyArray<PageHierarchyDirectoryEncoded>;
  readonly name: string;
  readonly pages: ReadonlyArray<typeof PageSummary.Encoded>;
  readonly path: string;
}

export const PageHierarchyDirectory: Schema.Codec<
  PageHierarchyDirectory,
  PageHierarchyDirectoryEncoded
> = Schema.Struct({
  cover: Schema.optional(PageSummary).pipe(
    Schema.annotateKey({ description: "Optional active index.md cover Page." }),
  ),
  directories: Schema.Array(
    Schema.suspend(
      (): Schema.Codec<PageHierarchyDirectory, PageHierarchyDirectoryEncoded> =>
        PageHierarchyDirectory,
    ),
  ).pipe(Schema.annotateKey({ description: "Immediate derived child directories." })),
  name: Schema.String.pipe(Schema.annotateKey({ description: "Directory display segment." })),
  pages: Schema.Array(PageSummary).pipe(
    Schema.annotateKey({ description: "Immediate non-cover Pages in the directory." }),
  ),
  path: PageDirectoryPath.pipe(
    Schema.annotateKey({ description: "Derived repository-relative directory path." }),
  ),
}).pipe(
  Schema.annotate({
    description: "A recursively derived Page directory with an optional index cover.",
    identifier: "@cycle/contracts/PageHierarchyDirectory",
    title: "PageHierarchyDirectory",
  }),
);
