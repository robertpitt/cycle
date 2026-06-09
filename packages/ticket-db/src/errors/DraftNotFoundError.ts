import { Schema } from "effect";

export class DraftNotFoundError extends Schema.TaggedErrorClass<DraftNotFoundError>(
  "@cycle/ticket-db/DraftNotFoundError",
)("DraftNotFoundError", {
  draftId: Schema.String,
  message: Schema.String,
}) {}

export const draftNotFound = (draftId: string): DraftNotFoundError =>
  new DraftNotFoundError({
    draftId,
    message: `Draft not found: ${draftId}`,
  });
