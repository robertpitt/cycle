import { Schema } from "effect";
import { PageId } from "../components/PageId.ts";
import { PagePath } from "../components/PagePath.ts";

export class PagePathConflict extends Schema.TaggedErrorClass<PagePathConflict>(
  "@cycle/contracts/PagePathConflict",
)("PagePathConflict", {
  conflictingPageId: PageId,
  message: Schema.String,
  path: PagePath,
  repositoryId: Schema.String,
}) {}
