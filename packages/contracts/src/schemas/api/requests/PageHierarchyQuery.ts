import { Schema } from "effect";
import { PageDirectoryPath } from "../../components/PageDirectoryPath.ts";

export const PageHierarchyQuery = Schema.Struct({
  archived: Schema.optional(Schema.Literals(["exclude", "include", "only"])).pipe(
    Schema.annotateKey({
      description: "Archive selection; omitted and exclude both derive an active hierarchy.",
    }),
  ),
  directory: Schema.optional(PageDirectoryPath).pipe(
    Schema.annotateKey({ description: "Hierarchy root directory; empty is repository root." }),
  ),
  recursive: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({ description: "Whether the complete descendant subtree is returned." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Scope options for deriving the Page directory hierarchy.",
    identifier: "@cycle/contracts/PageHierarchyQuery",
    title: "PageHierarchyQuery",
  }),
);
export type PageHierarchyQuery = typeof PageHierarchyQuery.Type;
