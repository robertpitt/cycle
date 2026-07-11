import { Schema } from "effect";
import { NonEmptyTrimmedString } from "../components/NonEmptyTrimmedString.ts";
import { PageStateFields } from "./PageState.ts";

const PageDocumentStruct = Schema.Struct({
  ...PageStateFields,
  revisionId: NonEmptyTrimmedString.pipe(
    Schema.annotateKey({ description: "Snapshot of the latest Page-state event." }),
  ),
});

export const PageDocument = PageDocumentStruct.check(
  Schema.makeFilter<typeof PageDocumentStruct.Type>(
    (value) => value.id === value.frontmatter.id || "Page id must match frontmatter id",
  ),
).pipe(
  Schema.annotate({
    description: "Canonical public Page document served from the active projection.",
    identifier: "@cycle/contracts/PageDocument",
    title: "PageDocument",
  }),
);
export type PageDocument = typeof PageDocument.Type;
