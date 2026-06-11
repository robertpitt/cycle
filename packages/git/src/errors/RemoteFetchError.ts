import { Schema } from "effect";

export class RemoteFetchError extends Schema.TaggedErrorClass<RemoteFetchError>(
  "@cycle/git/RemoteFetchError",
)("RemoteFetchError", {
  cause: Schema.optional(Schema.Defect()),
  message: Schema.String,
  operation: Schema.String,
  remote: Schema.String,
  status: Schema.optional(Schema.Number),
  stderr: Schema.optional(Schema.String),
}) {}

export const remoteFetchError = (
  remote: string,
  operation: string,
  message: string,
  options: { readonly cause?: unknown; readonly status?: number; readonly stderr?: string } = {},
): RemoteFetchError =>
  new RemoteFetchError({
    cause: options.cause,
    message,
    operation,
    remote,
    status: options.status,
    stderr: options.stderr,
  });
