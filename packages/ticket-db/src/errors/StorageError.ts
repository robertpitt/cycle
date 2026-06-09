import { Schema } from "effect";

export class StorageError extends Schema.TaggedErrorClass<StorageError>(
  "@cycle/ticket-db/StorageError",
)("StorageError", {
  cause: Schema.Defect(),
  message: Schema.String,
  operation: Schema.String,
}) {}

export const storageError = (operation: string, cause: unknown): StorageError =>
  new StorageError({
    cause,
    message: `TicketDB storage failure during ${operation}`,
    operation,
  });
