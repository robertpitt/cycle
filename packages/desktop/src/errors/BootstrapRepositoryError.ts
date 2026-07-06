import { Schema } from "effect";

export class BootstrapRepositoryError extends Schema.TaggedErrorClass<BootstrapRepositoryError>(
  "@cycle/desktop/BootstrapRepositoryError",
)("BootstrapRepositoryError", {
  message: Schema.String,
  repositoryId: Schema.String,
}) {}
