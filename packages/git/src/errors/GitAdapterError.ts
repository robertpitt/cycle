import { Schema } from "effect";

export class GitAdapterError extends Schema.TaggedErrorClass<GitAdapterError>(
  "@cycle/git/GitAdapterError",
)("GitAdapterError", {
  cause: Schema.optional(Schema.Defect()),
  message: Schema.String,
  operation: Schema.String,
  status: Schema.optional(Schema.Number),
  stderr: Schema.optional(Schema.String),
}) {}

export const gitAdapterError = (
  operation: string,
  message: string,
  options: { readonly cause?: unknown; readonly status?: number; readonly stderr?: string } = {},
): GitAdapterError =>
  new GitAdapterError({
    cause: options.cause,
    message,
    operation,
    status: options.status,
    stderr: options.stderr,
  });
