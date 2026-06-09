import { Schema } from "effect";

export class PlanImmutabilityError extends Schema.TaggedErrorClass<PlanImmutabilityError>(
  "@cycle/ticket-db/PlanImmutabilityError",
)("PlanImmutabilityError", {
  issueId: Schema.String,
  message: Schema.String,
  sections: Schema.Array(Schema.String),
}) {}

export const planImmutabilityError = (
  issueId: string,
  sections: ReadonlyArray<string>,
): PlanImmutabilityError =>
  new PlanImmutabilityError({
    issueId,
    message: `Issue ${issueId} has protected plan section changes: ${sections.join(", ")}`,
    sections,
  });
