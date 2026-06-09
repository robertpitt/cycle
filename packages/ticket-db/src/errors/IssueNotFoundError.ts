import { Schema } from "effect";

export class IssueNotFoundError extends Schema.TaggedErrorClass<IssueNotFoundError>(
  "@cycle/ticket-db/IssueNotFoundError",
)("IssueNotFoundError", {
  issueId: Schema.String,
  message: Schema.String,
}) {}

export const issueNotFound = (issueId: string): IssueNotFoundError =>
  new IssueNotFoundError({
    issueId,
    message: `Issue not found: ${issueId}`,
  });
