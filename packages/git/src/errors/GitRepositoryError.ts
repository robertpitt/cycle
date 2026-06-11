import { Schema } from "effect";

export class GitRepositoryError extends Schema.TaggedErrorClass<GitRepositoryError>(
  "@cycle/git/GitRepositoryError",
)("GitRepositoryError", {
  cause: Schema.optional(Schema.Defect()),
  message: Schema.String,
  operation: Schema.String,
  path: Schema.String,
}) {}

export const gitRepositoryError = (
  operation: string,
  path: string,
  message: string,
  options: { readonly cause?: unknown } = {},
): GitRepositoryError =>
  new GitRepositoryError({
    cause: options.cause,
    message,
    operation,
    path,
  });
