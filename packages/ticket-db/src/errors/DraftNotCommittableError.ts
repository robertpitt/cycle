import { Schema } from "effect";

export class DraftNotCommittableError extends Schema.TaggedErrorClass<DraftNotCommittableError>(
  "@cycle/ticket-db/DraftNotCommittableError",
)("DraftNotCommittableError", {
  draftId: Schema.String,
  message: Schema.String,
  status: Schema.String,
}) {}

export const draftNotCommittable = (draftId: string, status: string): DraftNotCommittableError =>
  new DraftNotCommittableError({
    draftId,
    message: `Draft ${draftId} cannot be committed from status ${status}`,
    status,
  });
