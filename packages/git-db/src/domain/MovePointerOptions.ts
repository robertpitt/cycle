import { Schema } from "effect";

export const MovePointerOptions = Schema.Struct({
  expectedSnapshot: Schema.optional(Schema.NullOr(Schema.String)),
});
export type MovePointerOptions = typeof MovePointerOptions.Type;
