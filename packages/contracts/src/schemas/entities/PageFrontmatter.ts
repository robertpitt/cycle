import { Schema } from "effect";
import { hasUnsafeObjectKey } from "../../internal/pageValidation.ts";
import { Actor } from "../components/Actor.ts";
import { IsoDateTimeString } from "../components/IsoDateTimeString.ts";
import { NonEmptyTrimmedString } from "../components/NonEmptyTrimmedString.ts";
import { PageId } from "../components/PageId.ts";
import { SafeJsonObject } from "../components/SafeJsonObject.ts";

const PageFrontmatterStruct = Schema.StructWithRest(
  Schema.Struct({
    id: PageId.pipe(Schema.annotateKey({ description: "Immutable stable Page id." })),
    title: NonEmptyTrimmedString.pipe(
      Schema.annotateKey({ description: "User-facing Page title." }),
    ),
    schemaVersion: Schema.Literal(1).pipe(
      Schema.annotateKey({ description: "Encoded Page schema version." }),
    ),
    createdAt: IsoDateTimeString.pipe(
      Schema.annotateKey({ description: "Timestamp of Page creation." }),
    ),
    createdBy: Actor.pipe(Schema.annotateKey({ description: "Actor that created the Page." })),
    updatedAt: IsoDateTimeString.pipe(
      Schema.annotateKey({ description: "Timestamp of the latest Page-state mutation." }),
    ),
    updatedBy: Actor.pipe(
      Schema.annotateKey({ description: "Actor responsible for the latest Page-state mutation." }),
    ),
    archivedAt: Schema.optional(IsoDateTimeString).pipe(
      Schema.annotateKey({ description: "Timestamp when the Page was archived." }),
    ),
    archivedBy: Schema.optional(Actor).pipe(
      Schema.annotateKey({ description: "Actor that archived the Page." }),
    ),
  }),
  [SafeJsonObject],
);

export const PageFrontmatter = PageFrontmatterStruct.check(
  Schema.makeFilter<typeof PageFrontmatterStruct.Type>((value) => {
    if (hasUnsafeObjectKey(value)) return "frontmatter must not contain unsafe object keys";

    const hasArchivedAt = value.archivedAt !== undefined;
    const hasArchivedBy = value.archivedBy !== undefined;
    return (
      hasArchivedAt === hasArchivedBy || "archive timestamp and actor must be present together"
    );
  }),
).pipe(
  Schema.annotate({
    description: "Schema-backed Page frontmatter with safe extension data.",
    identifier: "@cycle/contracts/PageFrontmatter",
    title: "PageFrontmatter",
  }),
);
export type PageFrontmatter = typeof PageFrontmatter.Type;
