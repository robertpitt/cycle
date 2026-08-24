import { Schema } from "effect";
import { PageId } from "../components/PageId.ts";

export class PageRevisionNotFound extends Schema.TaggedErrorClass<PageRevisionNotFound>(
  "@cycle/contracts/PageRevisionNotFound",
)("PageRevisionNotFound", {
  message: Schema.String,
  pageId: PageId,
  repositoryId: Schema.String,
  snapshotId: Schema.String,
}) {}
