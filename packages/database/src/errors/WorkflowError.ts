import { Schema } from "effect";

export class WorkflowError extends Schema.TaggedErrorClass<WorkflowError>(
  "@cycle/database/WorkflowError",
)("WorkflowError", {
  message: Schema.String,
  ticketId: Schema.optional(Schema.String),
}) {}
