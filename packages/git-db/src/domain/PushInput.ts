import { Schema } from "effect";

export const PushInput = Schema.Struct({
  refspecs: Schema.Array(Schema.String),
  remote: Schema.String,
});
export type PushInput = typeof PushInput.Type;
