import {
  type RepositoryInput,
  type UseCaseInput,
  type UseCaseMeta,
  type UseCaseName,
  type UseCaseFailure,
} from "@cycle/contracts";
import { logInfo, logWarning } from "@cycle/logging";
import {
  AutomationEvaluateIssues,
  AutomationEvaluateQuery,
  AutomationEvaluateRepository,
  type UseCaseDefinition,
} from "@cycle/usecases";
import { Crypto, Effect, Result, Schema } from "effect";
import { Headers, HttpServerResponse } from "effect/unstable/http";
import { CycleApiRuntime, type CycleApiRuntimeShape } from "../runtime/CycleApiRuntime.ts";
import type { AutomationEvaluatePayload } from "../schemas.ts";
import { requestIdFromHeaders } from "./crypto.ts";
import { asPage, optionalString, pageLimitFrom, urlFromRequest } from "./query.ts";
import { collectionResponse, errorResponse, errorResponseFromUseCaseFailure } from "./responses.ts";

const StrictDecodeOptions = { onExcessProperty: "error" } as const;

type UseCaseInvocation = {
  readonly definition: UseCaseDefinition<any, any>;
  readonly input: unknown;
  readonly meta?: UseCaseMeta;
};

export const useCaseInvocation = <Name extends UseCaseName>(
  definition: UseCaseDefinition<Name, any>,
  input: UseCaseInput<Name>,
  meta?: UseCaseMeta,
): UseCaseInvocation => ({
  definition,
  input,
  ...(meta === undefined ? {} : { meta }),
});

export const runUseCase = <Name extends UseCaseName>(
  definition: UseCaseDefinition<Name, any>,
  input: UseCaseInput<Name>,
  useCaseMeta?: UseCaseMeta,
): Effect.Effect<unknown, never, CycleApiRuntime> =>
  Effect.gen(function* () {
    const runtime = yield* CycleApiRuntime;
    const result = yield* Effect.result(
      definition
        .run(input, useCaseMeta)
        .pipe(Effect.provide(runtime.useCaseLayer)) as Effect.Effect<unknown, UseCaseFailure>,
    );
    const fields = {
      requestId: useCaseMeta?.requestId ?? null,
      useCase: definition.name,
    };

    if (Result.isFailure(result)) {
      yield* logWarning("api", "api usecase request failed", {
        ...fields,
        failureTag: result.failure._tag,
      });
      return errorResponseFromUseCaseFailure(result.failure);
    }

    yield* notifyUseCaseSuccess(runtime, definition, input, useCaseMeta, result.success);
    yield* logInfo("api", "api usecase request completed", fields);
    return result.success;
  });

const notifyUseCaseSuccess = <Name extends UseCaseName>(
  runtime: CycleApiRuntimeShape,
  definition: UseCaseDefinition<Name, any>,
  input: UseCaseInput<Name>,
  useCaseMeta: UseCaseMeta | undefined,
  value: unknown,
): Effect.Effect<void, never> => {
  if (runtime.onUseCaseSuccess === undefined) return Effect.void;

  return Effect.tryPromise({
    try: () =>
      Promise.resolve(
        runtime.onUseCaseSuccess?.({
          input,
          meta: useCaseMeta,
          name: definition.name,
          sideEffect: definition.sideEffect,
          value: value as never,
        }),
      ),
    catch: (error) => error,
  }).pipe(
    Effect.catch((error) =>
      logWarning("api", "api usecase success notification failed", {
        error: error instanceof Error ? error.message : String(error),
        requestId: useCaseMeta?.requestId ?? null,
        useCase: definition.name,
      }),
    ),
  );
};

export const pagedUseCaseResponse = (
  request: { readonly headers: Headers.Headers; readonly url: string },
  useCase: UseCaseInvocation | ((requestId: string) => UseCaseInvocation),
): Effect.Effect<HttpServerResponse.HttpServerResponse, never, CycleApiRuntime | Crypto.Crypto> =>
  Effect.gen(function* () {
    const requestId = yield* requestIdFromHeaders(request.headers);
    const url = urlFromRequest(request);
    const invocation = typeof useCase === "function" ? useCase(requestId) : useCase;
    const pageValue = yield* runUseCase(
      invocation.definition,
      invocation.input as never,
      invocation.meta,
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

export const decodeHttpValue = <S extends Schema.Top>(
  schema: S,
  value: unknown,
  requestId: string,
  options: {
    readonly code: string;
    readonly message: string;
    readonly status?: number;
  },
): Effect.Effect<S["Type"] | HttpServerResponse.HttpServerResponse> =>
  Schema.decodeUnknownEffect(
    schema,
    StrictDecodeOptions,
  )(value).pipe(
    Effect.catch((error) =>
      Effect.succeed(
        errorResponse(requestId, options.status ?? 400, options.code, options.message, false, {
          parseError: String(error),
        }),
      ),
    ),
  ) as Effect.Effect<S["Type"] | HttpServerResponse.HttpServerResponse>;

export const objectPayload = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};

export const runAutomationUseCase = (
  repositoryId: string,
  payload: AutomationEvaluatePayload,
  requestId: string,
): Effect.Effect<unknown, never, CycleApiRuntime> => {
  const repository = { id: repositoryId };

  if (payload.issueIds !== undefined) {
    return runUseCase(
      AutomationEvaluateIssues,
      {
        issueIds: payload.issueIds,
        repository,
        severityThreshold: payload.severityThreshold,
      },
      meta(requestId),
    );
  }

  if (payload.query !== undefined) {
    return runUseCase(
      AutomationEvaluateQuery,
      {
        query: payload.query,
        repository,
        severityThreshold: payload.severityThreshold,
      },
      meta(requestId),
    );
  }

  return runUseCase(
    AutomationEvaluateRepository,
    {
      failOnWarnings: payload.failOnWarnings,
      repository,
      requireFresh: payload.requireFresh,
    },
    meta(requestId),
  );
};

export const repositoryOpenInputFrom = (
  runtime: CycleApiRuntimeShape,
  payload: Readonly<Record<string, unknown>>,
  requestId: string,
): Effect.Effect<RepositoryInput | HttpServerResponse.HttpServerResponse> =>
  Effect.gen(function* () {
    const resolver = runtime.repositoryOpenInput;

    if (resolver !== undefined) {
      return yield* Effect.tryPromise({
        try: () =>
          resolver(
            {
              displayName: optionalString(payload.displayName),
              path: optionalString(payload.path),
              repositoryId: optionalString(payload.repositoryId),
              syncOnOpen: typeof payload.syncOnOpen === "boolean" ? payload.syncOnOpen : undefined,
            },
            { requestId },
          ),
        catch: () =>
          errorResponse(
            requestId,
            500,
            "REPOSITORY_OPEN_FAILED",
            "Repository open input resolution failed.",
          ),
      }).pipe(Effect.catch((response) => Effect.succeed(response)));
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
