import { Schema } from "effect";

export class RepositoryNotFoundError extends Schema.TaggedErrorClass<RepositoryNotFoundError>(
  "@cycle/database/RepositoryNotFoundError",
)("RepositoryNotFoundError", {
  message: Schema.String,
  repositoryId: Schema.String,
}) {}
