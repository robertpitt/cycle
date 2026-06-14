import {
  AutomationEvaluateIssues,
  AutomationEvaluateQuery,
  AutomationEvaluateRepository,
  type CycleUseCase,
  type RepositoryInput,
  type UseCaseMeta,
} from "@cycle/contracts";
import { logInfo, logWarning } from "@cycle/logging";
import { type UseCaseFailure } from "@cycle/usecases";
import { Crypto, Effect, Result } from "effect";
import { Headers, HttpServerResponse } from "effect/unstable/http";
import { CycleApiRuntime, type CycleApiRuntimeShape } from "../runtime/CycleApiRuntime.ts";
import { requestIdFromHeaders } from "./crypto.ts";
import {
  asPage,
  optionalString,
  pageLimitFrom,
  severityThreshold,
  urlFromRequest,
} from "./query.ts";
import { collectionResponse, errorResponse, errorResponseFromUseCaseFailure } from "./responses.ts";

export const runUseCase = (useCase: CycleUseCase): Effect.Effect<unknown, never, CycleApiRuntime> =>
  Effect.gen(function* () {
    const runtime = yield* CycleApiRuntime;
    const effect = runtime.runner.run(useCase as any) as unknown as Effect.Effect<
      unknown,
      UseCaseFailure
    >;
    const result = yield* Effect.result(effect);
    const fields = {
      requestId: useCase.meta?.requestId ?? null,
      useCase: useCase.name,
    };

    if (Result.isFailure(result)) {
      yield* logWarning("api", "api usecase request failed", {
        ...fields,
        failureTag: result.failure._tag,
      });
      return errorResponseFromUseCaseFailure(result.failure);
    }

    yield* logInfo("api", "api usecase request completed", fields);
    return result.success;
  });

export const pagedUseCaseResponse = (
  request: { readonly headers: Headers.Headers; readonly url: string },
  useCase: CycleUseCase | ((requestId: string) => CycleUseCase),
): Effect.Effect<HttpServerResponse.HttpServerResponse, never, CycleApiRuntime | Crypto.Crypto> =>
  Effect.gen(function* () {
    const requestId = yield* requestIdFromHeaders(request.headers);
    const url = urlFromRequest(request);
    const pageValue = yield* runUseCase(
      typeof useCase === "function" ? useCase(requestId) : useCase,
    );
    if (HttpServerResponse.isHttpServerResponse(pageValue)) return pageValue;
    const result = asPage(pageValue);

    return collectionResponse(
      requestId,
      url,
      result.entries,
      pageLimitFrom(url.searchParams),
      result.nextCursor,
    );
  });

export const runAutomationUseCase = (
  repositoryId: string,
  payload: Readonly<Record<string, unknown>>,
  requestId: string,
): Effect.Effect<unknown, never, CycleApiRuntime> => {
  const repository = { id: repositoryId };

  if (Array.isArray(payload.issueIds)) {
    return runUseCase(
      AutomationEvaluateIssues(
        {
          issueIds: payload.issueIds.filter((value): value is string => typeof value === "string"),
          repository,
          severityThreshold: severityThreshold(payload.severityThreshold),
        },
        meta(requestId),
      ),
    );
  }

  if (isRecord(payload.query)) {
    return runUseCase(
      AutomationEvaluateQuery(
        {
          query: payload.query,
          repository,
          severityThreshold: severityThreshold(payload.severityThreshold),
        },
        meta(requestId),
      ),
    );
  }

  return runUseCase(
    AutomationEvaluateRepository(
      {
        failOnWarnings:
          typeof payload.failOnWarnings === "boolean" ? payload.failOnWarnings : undefined,
        repository,
        requireFresh: typeof payload.requireFresh === "boolean" ? payload.requireFresh : undefined,
      },
      meta(requestId),
    ),
  );
};

export const repositoryOpenInputFrom = (
  runtime: CycleApiRuntimeShape,
  payload: Readonly<Record<string, unknown>>,
  requestId: string,
): Effect.Effect<RepositoryInput | HttpServerResponse.HttpServerResponse> =>
  Effect.promise(async () => {
    try {
      if (runtime.repositoryOpenInput !== undefined) {
        return runtime.repositoryOpenInput(
          {
            displayName: optionalString(payload.displayName),
            path: optionalString(payload.path),
            repositoryId: optionalString(payload.repositoryId),
            syncOnOpen: typeof payload.syncOnOpen === "boolean" ? payload.syncOnOpen : undefined,
          },
          { requestId },
        );
      }

      if (typeof payload.repositoryId === "string" && payload.store !== undefined) {
        return {
          displayName: optionalString(payload.displayName),
          repositoryId: payload.repositoryId,
          store: payload.store as RepositoryInput["store"],
          syncOnOpen: typeof payload.syncOnOpen === "boolean" ? payload.syncOnOpen : undefined,
          worktreePath: optionalString(payload.worktreePath ?? payload.path),
        };
      }

      return errorResponse(
        requestId,
        501,
        "REPOSITORY_OPEN_UNAVAILABLE",
        "Opening repositories requires a host-provided repositoryOpenInput resolver.",
      );
    } catch {
      return errorResponse(
        requestId,
        500,
        "REPOSITORY_OPEN_FAILED",
        "Repository open input resolution failed.",
      );
    }
  });

export const meta = (requestId: string): UseCaseMeta => ({
  requestId,
  source: "api",
});

export const scoped = <T>(
  repositoryId: string,
  input: T,
): { readonly input: T; readonly repository: { readonly id: string } } => ({
  input,
  repository: { id: repositoryId },
});

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
