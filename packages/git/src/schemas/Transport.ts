import { Schema } from "effect";

export const FetchInput = Schema.Struct({
  prune: Schema.optional(Schema.Boolean),
  refspecs: Schema.Array(Schema.String),
  remote: Schema.String,
});
export type FetchInput = typeof FetchInput.Type;

export const PushInput = Schema.Struct({
  refspecs: Schema.Array(Schema.String),
  remote: Schema.String,
});
export type PushInput = typeof PushInput.Type;
