import { Schema } from "effect";
import { PageId } from "../components/PageId.ts";
import { PageSummary } from "../entities/PageSummary.ts";

export class PageRevisionConflict extends Schema.TaggedErrorClass<PageRevisionConflict>(
  "@cycle/contracts/PageRevisionConflict",
)("PageRevisionConflict", {
  actualRevisionId: Schema.String,
  current: PageSummary,
  expectedRevisionId: Schema.String,
  message: Schema.String,
  pageId: PageId,
  repositoryId: Schema.String,
}) {}
