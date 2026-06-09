import { Schema } from "effect";

export const FetchInput = Schema.Struct({
  refspecs: Schema.Array(Schema.String),
  remote: Schema.String,
});
export type FetchInput = typeof FetchInput.Type;
