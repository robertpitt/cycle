import { Schema } from "effect";

export const AgentJson = Schema.Json;
export type AgentJson = typeof AgentJson.Type;

export const AgentJsonObject = Schema.Record(Schema.String, AgentJson);
export type AgentJsonObject = typeof AgentJsonObject.Type;

export const AgentTimestamp = Schema.DateTimeUtcFromString;
export type AgentTimestamp = typeof AgentTimestamp.Type;
export type AgentTimestampEncoded = typeof AgentTimestamp.Encoded;

export const AgentProviderIdSchema = Schema.String.check(
  Schema.isMinLength(1, { expected: "non-empty provider id" }),
);

export const AgentHarnessIdSchema = Schema.String.check(
  Schema.isMinLength(1, { expected: "non-empty harness id" }),
);

export const AgentAuthorityMode = Schema.Literals([
  "conversation-read",
  "repository-read",
  "implementation-worktree",
  "disposable-worktree",
  "operator-full-access",
]);
export type AgentAuthorityMode = typeof AgentAuthorityMode.Type;

export const AgentAuthority = Schema.Struct({
  allowedOperations: Schema.Array(Schema.String),
  mode: AgentAuthorityMode,
  repositoryId: Schema.optional(Schema.String),
  ticketId: Schema.optional(Schema.String),
  workspacePath: Schema.optional(Schema.String),
  worktreeId: Schema.optional(Schema.String),
});
export type AgentAuthority = typeof AgentAuthority.Type;

export const AgentTerminalError = Schema.Struct({
  code: Schema.String,
  message: Schema.String,
  retryable: Schema.Boolean,
});
export type AgentTerminalError = typeof AgentTerminalError.Type;

export const AgentTerminalResult = Schema.Union([
  Schema.Struct({
    output: Schema.optional(AgentJson),
    status: Schema.Literal("completed"),
    summary: Schema.String,
  }),
  Schema.Struct({
    error: AgentTerminalError,
    status: Schema.Literal("failed"),
  }),
  Schema.Struct({
    reason: Schema.String,
    status: Schema.Literal("cancelled"),
  }),
]);
export type AgentTerminalResult = typeof AgentTerminalResult.Type;
