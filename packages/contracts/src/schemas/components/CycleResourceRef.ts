import { Schema } from "effect";
import { NonEmptyTrimmedString } from "./NonEmptyTrimmedString.ts";
import { PageId } from "./PageId.ts";

const TicketResourceRef = Schema.Struct({
  repositoryId: NonEmptyTrimmedString,
  resourceKind: Schema.Literal("ticket"),
  resourceId: NonEmptyTrimmedString,
});

const PageResourceRef = Schema.Struct({
  repositoryId: NonEmptyTrimmedString,
  resourceKind: Schema.Literal("page"),
  resourceId: PageId,
});

export const CycleResourceRef = Schema.Union([TicketResourceRef, PageResourceRef]).pipe(
  Schema.annotate({
    description: "A stable repository-scoped reference to a commentable Cycle resource.",
    identifier: "@cycle/contracts/CycleResourceRef",
    title: "CycleResourceRef",
  }),
);
export type CycleResourceRef = typeof CycleResourceRef.Type;
