import type { DatabaseFailure } from "@cycle/database";
import type { UseCaseName } from "./contracts/index.ts";
import type { UseCaseFailure, UseCaseFailureTag } from "./schemas/failures/index.ts";

export type { UseCaseFailure, UseCaseFailureTag } from "./schemas/failures/index.ts";

type FailureInput = {
  readonly code?: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly field?: string;
  readonly message: string;
  readonly pageId?: string;
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
  ...(input.pageId === undefined ? {} : { pageId: input.pageId }),
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
    readonly pageId?: string;
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
  const pageId = typeof error["pageId"] === "string" ? error["pageId"] : context.pageId;
  const ticketId = typeof error["ticketId"] === "string" ? error["ticketId"] : context.ticketId;
  const field = typeof error["field"] === "string" ? error["field"] : undefined;
  const details = detailsFrom(error);

  switch (sourceTag) {
    case "DatabaseRepositoryNotFoundError":
      return useCaseFailure({
        code: "REPOSITORY_NOT_OPEN",
        details,
        message,
        pageId,
        repositoryId,
        requestId: context.requestId,
        retryable: false,
        tag: "RepositoryNotOpenFailure",
        ticketId,
        useCase: context.useCase,
      });
    case "PageNotFound":
    case "PageRevisionNotFound":
    case "CommentTargetNotFound":
      return useCaseFailure({
        code:
          sourceTag === "PageNotFound"
            ? "PAGE_NOT_FOUND"
            : sourceTag === "PageRevisionNotFound"
              ? "PAGE_REVISION_NOT_FOUND"
              : "COMMENT_TARGET_NOT_FOUND",
        details,
        message,
        pageId,
        repositoryId,
        requestId: context.requestId,
        tag: "NotFoundFailure",
        ticketId,
        useCase: context.useCase,
      });
    case "PagePathConflict":
    case "PageRevisionConflict":
    case "PageInvalidState":
      return useCaseFailure({
        code:
          sourceTag === "PagePathConflict"
            ? "PAGE_PATH_CONFLICT"
            : sourceTag === "PageRevisionConflict"
              ? "PAGE_REVISION_CONFLICT"
              : "PAGE_INVALID_STATE",
        details,
        message,
        pageId,
        repositoryId,
        requestId: context.requestId,
        tag: "ConflictFailure",
        ticketId,
        useCase: context.useCase,
      });
    case "PagePathInvalid":
    case "PageDocumentInvalid":
      return useCaseFailure({
        code: sourceTag === "PagePathInvalid" ? "PAGE_PATH_INVALID" : "PAGE_DOCUMENT_INVALID",
        details,
        field,
        message,
        pageId,
        repositoryId,
        requestId: context.requestId,
        tag: "InvalidInputFailure",
        ticketId,
        useCase: context.useCase,
      });
    case "CommentTargetUnsupported":
      return useCaseFailure({
        code: "COMMENT_TARGET_UNSUPPORTED",
        details,
        message,
        pageId,
        repositoryId,
        requestId: context.requestId,
        tag: "InvalidInputFailure",
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
    const safeValue = safeDetailValue(value);
    if (safeValue !== undefined) details[key] = safeValue;
  }

  return details;
};

const safeDetailValue = (value: unknown): unknown => {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const safeEntry = safeDetailValue(entry);
      return safeEntry === undefined ? [] : [safeEntry];
    });
  }

  if (!isRecord(value)) return undefined;

  const record: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (unsafeDetailKeys.has(key) || secretPattern.test(key)) continue;
    const safeEntry = safeDetailValue(entry);
    if (safeEntry !== undefined) record[key] = safeEntry;
  }
  return record;
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
