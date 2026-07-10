import { Schema } from "effect";

const ErrorFields = {
  code: Schema.String,
  message: Schema.String,
  retryable: Schema.Boolean,
};

export class AgentValidationError extends Schema.TaggedErrorClass<AgentValidationError>()(
  "AgentValidationError",
  { ...ErrorFields, field: Schema.optional(Schema.String) },
) {}

export class AgentNotFoundError extends Schema.TaggedErrorClass<AgentNotFoundError>()(
  "AgentNotFoundError",
  { ...ErrorFields, entityId: Schema.String, entityType: Schema.String },
) {}

export class AgentStateConflictError extends Schema.TaggedErrorClass<AgentStateConflictError>()(
  "AgentStateConflictError",
  {
    ...ErrorFields,
    actualState: Schema.optional(Schema.String),
    entityId: Schema.String,
    expectedState: Schema.optional(Schema.String),
  },
) {}

export class AgentIdempotencyConflictError extends Schema.TaggedErrorClass<AgentIdempotencyConflictError>()(
  "AgentIdempotencyConflictError",
  { ...ErrorFields, idempotencyKey: Schema.String },
) {}

export class AgentAuthorityError extends Schema.TaggedErrorClass<AgentAuthorityError>()(
  "AgentAuthorityError",
  { ...ErrorFields, operation: Schema.String },
) {}

export class AgentCapacityError extends Schema.TaggedErrorClass<AgentCapacityError>()(
  "AgentCapacityError",
  { ...ErrorFields, gate: Schema.String },
) {}

export class AgentStorageError extends Schema.TaggedErrorClass<AgentStorageError>()(
  "AgentStorageError",
  { ...ErrorFields, operation: Schema.String },
) {}

export class AgentMigrationError extends Schema.TaggedErrorClass<AgentMigrationError>()(
  "AgentMigrationError",
  { ...ErrorFields, migration: Schema.String },
) {}

export class AgentHarnessError extends Schema.TaggedErrorClass<AgentHarnessError>()(
  "AgentHarnessError",
  { ...ErrorFields, harnessId: Schema.String, reason: Schema.String },
) {}

export class AgentWorkflowError extends Schema.TaggedErrorClass<AgentWorkflowError>()(
  "AgentWorkflowError",
  { ...ErrorFields, operationId: Schema.optional(Schema.String), workflowId: Schema.String },
) {}

export class ImplementationContextIncomplete extends Schema.TaggedErrorClass<ImplementationContextIncomplete>()(
  "ImplementationContextIncomplete",
  {
    ...ErrorFields,
    missingBindings: Schema.Array(Schema.String),
    reason: Schema.Literals(["missing", "mismatch", "stale"]),
    recoveryAction: Schema.String,
    threadId: Schema.String,
    ticketId: Schema.optional(Schema.String),
  },
) {}

export class AgentInteractionError extends Schema.TaggedErrorClass<AgentInteractionError>()(
  "AgentInteractionError",
  { ...ErrorFields, interactionId: Schema.String },
) {}

export class AgentReconciliationError extends Schema.TaggedErrorClass<AgentReconciliationError>()(
  "AgentReconciliationError",
  { ...ErrorFields, taskId: Schema.optional(Schema.String) },
) {}

export class AgentRetentionError extends Schema.TaggedErrorClass<AgentRetentionError>()(
  "AgentRetentionError",
  { ...ErrorFields, operation: Schema.String },
) {}

export type AgentError =
  | AgentValidationError
  | AgentNotFoundError
  | AgentStateConflictError
  | AgentIdempotencyConflictError
  | AgentAuthorityError
  | AgentCapacityError
  | AgentStorageError
  | AgentMigrationError
  | AgentHarnessError
  | AgentWorkflowError
  | ImplementationContextIncomplete
  | AgentInteractionError
  | AgentReconciliationError
  | AgentRetentionError;

export const agentStorageError = (operation: string, cause: unknown): AgentStorageError =>
  new AgentStorageError({
    code: "agent_storage_error",
    message:
      cause instanceof Error ? cause.message : `Agent storage operation failed: ${operation}`,
    operation,
    retryable: true,
  });
