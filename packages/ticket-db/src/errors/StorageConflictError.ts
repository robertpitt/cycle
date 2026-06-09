import { Schema } from "effect";

export class StorageConflictError extends Schema.TaggedErrorClass<StorageConflictError>(
  "@cycle/ticket-db/StorageConflictError",
)("StorageConflictError", {
  actual: Schema.NullOr(Schema.String),
  cause: Schema.optional(Schema.Defect()),
  expected: Schema.NullOr(Schema.String),
  message: Schema.String,
  operation: Schema.String,
  pointer: Schema.String,
}) {}

export const storageConflict = (input: {
  readonly actual: string | null;
  readonly cause?: unknown;
  readonly expected: string | null;
  readonly operation: string;
  readonly pointer: string;
}): StorageConflictError =>
  new StorageConflictError({
    ...input,
    message: `TicketDB storage conflict during ${input.operation}: ${input.pointer} expected ${
      input.expected ?? "<missing>"
    }, actual ${input.actual ?? "<missing>"}`,
  });
