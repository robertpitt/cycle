import { Schema } from "effect";
import { PageHierarchyDirectory } from "./PageHierarchyDirectory.ts";

export const PageHierarchy = Schema.Struct({
  root: PageHierarchyDirectory.pipe(
    Schema.annotateKey({ description: "Root of the derived Page directory hierarchy." }),
  ),
}).pipe(
  Schema.annotate({
    description: "The derived directory hierarchy for one repository Page scope.",
    identifier: "@cycle/contracts/PageHierarchy",
    title: "PageHierarchy",
  }),
);
export type PageHierarchy = typeof PageHierarchy.Type;
