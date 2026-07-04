import { Schema } from "effect";
import { PositiveInteger } from "../../components/PositiveInteger.ts";

export const HistoryOptions = Schema.Struct({
  cursor: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Opaque pagination cursor returned by a previous history response.",
    }),
  ),
  from: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional source snapshot or projection identifier." }),
  ),
  limit: Schema.optional(PositiveInteger).pipe(
    Schema.annotateKey({ description: "Maximum number of history entries to return." }),
  ),
  max: Schema.optional(PositiveInteger).pipe(
    Schema.annotateKey({ description: "Legacy maximum entry count accepted by older callers." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Cursor and limit options for history requests.",
    identifier: "@cycle/contracts/HistoryOptions",
    title: "HistoryOptions",
  }),
);
export type HistoryOptions = typeof HistoryOptions.Type;
