import { Schema } from "effect";
import { IdentityInput } from "@cycle/git/schemas";

export const CommitOptions = Schema.Struct({
  author: Schema.optional(IdentityInput),
  committer: Schema.optional(IdentityInput),
  expectedSnapshot: Schema.optional(Schema.NullOr(Schema.String)),
  message: Schema.optional(Schema.String),
  pointer: Schema.optional(Schema.String),
});
export type CommitOptions = typeof CommitOptions.Type;
