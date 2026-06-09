import { Schema } from "effect";

export const ReadOptions = Schema.Struct({
  from: Schema.optional(Schema.String),
});
export type ReadOptions = typeof ReadOptions.Type;
