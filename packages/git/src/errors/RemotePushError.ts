import { Schema } from "effect";

export class RemotePushError extends Schema.TaggedErrorClass<RemotePushError>(
  "@cycle/git/RemotePushError",
)("RemotePushError", {
  cause: Schema.optional(Schema.Defect()),
  message: Schema.String,
  operation: Schema.String,
  remote: Schema.String,
  status: Schema.optional(Schema.Number),
  stderr: Schema.optional(Schema.String),
}) {}

export const remotePushError = (
  remote: string,
  operation: string,
  message: string,
  options: { readonly cause?: unknown; readonly status?: number; readonly stderr?: string } = {},
): RemotePushError =>
  new RemotePushError({
    cause: options.cause,
    message,
    operation,
    remote,
    status: options.status,
    stderr: options.stderr,
  });
