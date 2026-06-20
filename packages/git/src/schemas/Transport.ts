import { Schema } from "effect";

export const FetchInput = Schema.Struct({
  prune: Schema.optional(Schema.Boolean),
  refspecs: Schema.Array(Schema.String),
  remote: Schema.String,
});
export type FetchInput = typeof FetchInput.Type;

export const PushInput = Schema.Struct({
  forceWithLease: Schema.optional(
    Schema.Array(
      Schema.Struct({
        expected: Schema.optional(Schema.NullOr(Schema.String)),
        ref: Schema.String,
      }),
    ),
  ),
  refspecs: Schema.Array(Schema.String),
  remote: Schema.String,
});
export type PushInput = typeof PushInput.Type;
