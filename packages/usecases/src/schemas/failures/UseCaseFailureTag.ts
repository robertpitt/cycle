import { Schema } from "effect";

export const UseCaseFailureTag = Schema.Literals([
  "AutomationEvaluationFailure",
  "AuthorizationFailure",
  "ConflictFailure",
  "ConsistencyFailure",
  "InterruptionFailure",
  "InvalidInputFailure",
  "NotFoundFailure",
  "PolicyViolationFailure",
  "PushFailure",
  "RepositoryNotOpenFailure",
  "RepositoryUnavailableFailure",
  "StaleCursorFailure",
  "StorageFailure",
  "SyncFailure",
  "TimeoutFailure",
  "UnexpectedDefectFailure",
  "UnknownUseCaseFailure",
  "UnsupportedAliasFailure",
]).pipe(
  Schema.annotate({
    description: "Machine-readable usecase failure category.",
    identifier: "@cycle/usecases/UseCaseFailureTag",
    title: "UseCaseFailureTag",
  }),
);
export type UseCaseFailureTag = typeof UseCaseFailureTag.Type;
