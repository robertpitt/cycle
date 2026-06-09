import { Schema } from "effect";

export const HistoryOptions = Schema.Struct({
  from: Schema.optional(Schema.String),
  max: Schema.optional(Schema.Number),
  path: Schema.optional(Schema.String),
  since: Schema.optional(Schema.Union([Schema.Date, Schema.String])),
  until: Schema.optional(Schema.Union([Schema.Date, Schema.String])),
});
export type HistoryOptions = typeof HistoryOptions.Type;
