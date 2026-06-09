import { Schema } from "effect";
import { ExecutionStatus } from "./ExecutionStatus.ts";

export class ExecutionRecordPayload extends Schema.Class<ExecutionRecordPayload>(
  "@cycle/ticket-db/ExecutionRecordPayload",
)({
  branchName: Schema.optional(Schema.String),
  commitReferences: Schema.optional(Schema.Array(Schema.String)),
  completedAt: Schema.optional(Schema.String),
  diffSummary: Schema.optional(Schema.String),
  executionId: Schema.String,
  failureReason: Schema.optional(Schema.String),
  finalAgentReport: Schema.optional(Schema.String),
  jobType: Schema.String,
  providerName: Schema.optional(Schema.String),
  providerVersion: Schema.optional(Schema.String),
  reviewNotes: Schema.optional(Schema.String),
  startedAt: Schema.String,
  status: ExecutionStatus,
  testResults: Schema.optional(Schema.Array(Schema.String)),
  worktreePath: Schema.optional(Schema.String),
}) {}
