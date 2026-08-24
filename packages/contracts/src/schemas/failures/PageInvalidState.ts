import { Schema } from "effect";
import { PageId } from "../components/PageId.ts";

export class PageInvalidState extends Schema.TaggedErrorClass<PageInvalidState>(
  "@cycle/contracts/PageInvalidState",
)("PageInvalidState", {
  actualState: Schema.Literals(["active", "archived"]),
  expectedState: Schema.Literals(["active", "archived"]),
  message: Schema.String,
  pageId: PageId,
  repositoryId: Schema.String,
}) {}
