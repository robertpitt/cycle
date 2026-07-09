import type { DatabaseFailure } from "@cycle/database";
import type { UseCaseName } from "./contracts/index.ts";
import type { UseCaseFailure, UseCaseFailureTag } from "./schemas/failures/index.ts";

export type { UseCaseFailure, UseCaseFailureTag } from "./schemas/failures/index.ts";

type FailureInput = {
  readonly code?: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly field?: string;
  readonly message: string;
  readonly repositoryId?: string;
  readonly requestId: string;
  readonly retryable?: boolean;
  readonly tag: UseCaseFailureTag;
  readonly ticketId?: string;
  readonly useCase: string;
};

const unsafeDetailKeys = new Set(["cause", "message", "stack"]);
const secretPattern = /api[-_]?key|credential|password|private[-_]?key|secret|token/iu;

export const useCaseFailure = (input: FailureInput): UseCaseFailure => ({
  _tag: input.tag,
  ...(input.code === undefined ? {} : { code: input.code }),
  ...(input.details === undefined ? {} : { details: redactDetails(input.details) }),
  ...(input.field === undefined ? {} : { field: input.field }),
  message: input.message,
  ...(input.repositoryId === undefined ? {} : { repositoryId: input.repositoryId }),
  requestId: input.requestId,
  retryable: input.retryable ?? false,
  ...(input.ticketId === undefined ? {} : { ticketId: input.ticketId }),
  useCase: input.useCase,
});

export const invalidInputFailure = (input: {
  readonly details?: Readonly<Record<string, unknown>>;
  readonly field?: string;
  readonly message: string;
  readonly requestId: string;
  readonly useCase: string;
}): UseCaseFailure =>
  useCaseFailure({
    ...input,
    code: "INVALID_INPUT",
    tag: "InvalidInputFailure",
  });

export const policyViolationFailure = (input: {
  readonly code: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly field?: string;
  readonly message: string;
  readonly repositoryId?: string;
  readonly requestId: string;
  readonly ticketId?: string;
  readonly useCase: UseCaseName;
}): UseCaseFailure =>
  useCaseFailure({
    ...input,
    tag: "PolicyViolationFailure",
  });

export const mapDatabaseFailure = (
  error: DatabaseFailure | unknown,
  context: {
    readonly requestId: string;
    readonly repositoryId?: string;
    readonly ticketId?: string;
    readonly useCase: UseCaseName;
  },
): UseCaseFailure => {
  if (!isRecord(error)) {
    return useCaseFailure({
      message: "Storage request failed.",
      requestId: context.requestId,
      tag: "StorageFailure",
      useCase: context.useCase,
    });
  }

  const sourceTag = typeof error["_tag"] === "string" ? error["_tag"] : undefined;
  const message = typeof error["message"] === "string" ? error["message"] : "Request failed.";
  const repositoryId =
    typeof error["repositoryId"] === "string" ? error["repositoryId"] : context.repositoryId;
  const ticketId = typeof error["ticketId"] === "string" ? error["ticketId"] : context.ticketId;
  const field = typeof error["field"] === "string" ? error["field"] : undefined;
  const details = detailsFrom(error);

  switch (sourceTag) {
    case "DatabaseRepositoryNotFoundError":
      return useCaseFailure({
        code: "REPOSITORY_NOT_OPEN",
        details,
        message,
        repositoryId,
        requestId: context.requestId,
        retryable: false,
        tag: "RepositoryNotOpenFailure",
        ticketId,
        useCase: context.useCase,
      });
    case "DatabaseValidationError":
      return useCaseFailure({
        code: "INVALID_INPUT",
        details,
        field,
        message,
        repositoryId,
        requestId: context.requestId,
        tag: "InvalidInputFailure",
        ticketId,
        useCase: context.useCase,
      });
    case "DatabaseWorkflowError":
      return useCaseFailure({
        code: "POLICY_VIOLATION",
        details,
        message,
        repositoryId,
        requestId: context.requestId,
        tag: "PolicyViolationFailure",
        ticketId,
        useCase: context.useCase,
      });
    case "DatabaseConsistencyError":
      return useCaseFailure({
        code: "CONSISTENCY_FAILURE",
        details,
        message,
        repositoryId,
        requestId: context.requestId,
        retryable: true,
        tag: "ConsistencyFailure",
        ticketId,
        useCase: context.useCase,
      });
    case "DatabaseMaterializationError":
      return useCaseFailure({
        code: "SYNC_FAILURE",
        details,
        message,
        repositoryId,
        requestId: context.requestId,
        retryable: true,
        tag: "SyncFailure",
        ticketId,
        useCase: context.useCase,
      });
    default:
      return useCaseFailure({
        code: sourceTag ?? "STORAGE_FAILURE",
        details,
        message,
        repositoryId,
        requestId: context.requestId,
        retryable: sourceTag === "DatabaseStorageError" || sourceTag === "DatabaseSqliteError",
        tag: "StorageFailure",
        ticketId,
        useCase: context.useCase,
      });
  }
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

const detailsFrom = (error: Readonly<Record<string, unknown>>): Record<string, unknown> => {
  const details: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(error)) {
    if (unsafeDetailKeys.has(key) || secretPattern.test(key)) continue;
    if (
      value === null ||
      typeof value === "boolean" ||
      typeof value === "number" ||
      typeof value === "string" ||
      Array.isArray(value)
    ) {
      details[key] = value;
    }
  }

  return details;
};

const redactDetails = (
  details: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(details)) {
    redacted[key] = secretPattern.test(key) ? "[redacted]" : value;
  }

  return redacted;
};
