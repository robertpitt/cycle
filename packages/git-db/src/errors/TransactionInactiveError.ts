import { Schema } from "effect";

export class TransactionInactiveError extends Schema.TaggedErrorClass<TransactionInactiveError>(
  "@cycle/git-db/TransactionInactiveError",
)("TransactionInactiveError", {
  message: Schema.String,
}) {}
