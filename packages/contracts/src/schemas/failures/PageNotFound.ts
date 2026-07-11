import { Schema } from "effect";
import { PageId } from "../components/PageId.ts";

export class PageNotFound extends Schema.TaggedErrorClass<PageNotFound>(
  "@cycle/contracts/PageNotFound",
)("PageNotFound", {
  message: Schema.String,
  pageId: PageId,
  repositoryId: Schema.String,
}) {}
