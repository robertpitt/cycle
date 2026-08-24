import { Schema } from "effect";
import { PageDirectoryPath } from "../../components/PageDirectoryPath.ts";
import { PositiveInteger } from "../../components/PositiveInteger.ts";

export const PageQuery = Schema.Struct({
  archived: Schema.optional(Schema.Literals(["exclude", "include", "only"])).pipe(
    Schema.annotateKey({
      description: "Archive selection; omitted and exclude both return active Pages only.",
    }),
  ),
  cursor: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Opaque cursor returned by a prior Page list." }),
  ),
  directory: Schema.optional(PageDirectoryPath).pipe(
    Schema.annotateKey({ description: "Exact derived directory scope; empty is the root." }),
  ),
  limit: Schema.optional(PositiveInteger).pipe(
    Schema.annotateKey({ description: "Maximum Page summaries to return." }),
  ),
  recursive: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({ description: "Whether descendants beneath the directory are included." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Filters and pagination for Page listing without full-text search.",
    identifier: "@cycle/contracts/PageQuery",
    title: "PageQuery",
  }),
);
export type PageQuery = typeof PageQuery.Type;
