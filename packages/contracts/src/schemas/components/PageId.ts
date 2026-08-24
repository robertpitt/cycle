import { Schema } from "effect";

export const PageId = Schema.String.pipe(
  Schema.check(Schema.isUUID(7)),
  Schema.brand("PageId"),
  Schema.annotate({
    description: "A stable UUIDv7 Page identifier.",
    identifier: "@cycle/contracts/PageId",
    title: "PageId",
  }),
);
export type PageId = typeof PageId.Type;
