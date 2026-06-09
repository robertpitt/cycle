import { Schema } from "effect";

export class WorkflowError extends Schema.TaggedErrorClass<WorkflowError>(
  "@cycle/ticket-db/WorkflowError",
)("WorkflowError", {
  cause: Schema.optional(Schema.Defect()),
  issueId: Schema.optional(Schema.String),
  message: Schema.String,
}) {}

export const workflowError = (message: string, issueId?: string, cause?: unknown): WorkflowError =>
  new WorkflowError({ cause, issueId, message });
