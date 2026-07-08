import type { RepositoryInput } from "@cycle/contracts";
import type {
  UseCaseActor,
  UseCaseFailure,
  UseCaseInput,
  UseCaseMeta,
  UseCaseName,
} from "@cycle/usecases/contracts";
import { logInfo, logWarning } from "@cycle/logging";
import {
  AutomationEvaluateIssues,
  AutomationEvaluateQuery,
  AutomationEvaluateRepository,
  type UseCaseDefinition,
} from "@cycle/usecases";
import { Effect, Result, Schema } from "effect";
import { Headers, HttpServerResponse } from "effect/unstable/http";
import { CycleRequestContext } from "../middleware/CycleRequestContextMiddleware.ts";
import { CycleApiRuntime, type CycleApiRuntimeShape } from "../runtime/CycleApiRuntime.ts";
import type { AutomationEvaluatePayload } from "../schemas/AutomationEvaluationResourceEnvelope.ts";
import { asPage, optionalString, pageLimitFrom, urlFromRequest } from "./query.ts";
import { collectionResponse, errorResponse, errorResponseFromUseCaseFailure } from "./responses.ts";

const StrictDecodeOptions = { onExcessProperty: "error" } as const;

type UseCaseInvocation = {
  readonly run: Effect.Effect<unknown, never, CycleApiRuntime>;
};

export const useCaseInvocation = <Name extends UseCaseName, R>(
  definition: UseCaseDefinition<Name, R>,
  input: UseCaseInput<Name>,
  meta?: UseCaseMeta,
): UseCaseInvocation => ({
  run: runUseCase(definition, input, meta),
});

export const runUseCase = <Name extends UseCaseName, R>(
  definition: UseCaseDefinition<Name, R>,
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

const notifyUseCaseSuccess = <Name extends UseCaseName, R>(
  runtime: CycleApiRuntimeShape,
  definition: UseCaseDefinition<Name, R>,
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
  request: { readonly url: string },
  useCase: UseCaseInvocation | ((requestId: string) => UseCaseInvocation),
): Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  never,
  CycleApiRuntime | CycleRequestContext
> =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const url = urlFromRequest(request);
    const invocation = typeof useCase === "function" ? useCase(requestId) : useCase;
    const pageValue = yield* invocation.run;
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
  payload: Readonly<Record<string, unknown>>,
  requestId: string,
): Effect.Effect<RepositoryInput | HttpServerResponse.HttpServerResponse> =>
  Effect.gen(function* () {
    if (typeof payload.path === "string" || typeof payload.repositoryId === "string") {
      return {
        displayName: optionalString(payload.displayName),
        path: optionalString(payload.path),
        repositoryId: optionalString(payload.repositoryId),
        syncOnOpen: typeof payload.syncOnOpen === "boolean" ? payload.syncOnOpen : undefined,
      };
    }

    return errorResponse(
      requestId,
      400,
      "INVALID_REPOSITORY_OPEN_INPUT",
      "Repository path or repository id is required.",
    );
  });

const optionalHeader = (headers: Headers.Headers | undefined, key: string): string | undefined => {
  const value = headers?.[key];
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};

const actorTypeFromHeader = (value: string | undefined): UseCaseActor["type"] | undefined =>
  value === "agent" || value === "human" || value === "import" ? value : undefined;

const actorFromHeaders = (headers: Headers.Headers | undefined): UseCaseActor | undefined => {
  const type = actorTypeFromHeader(optionalHeader(headers, "x-cycle-actor-type"));
  const name = optionalHeader(headers, "x-cycle-actor-name");
  if (type === undefined || name === undefined) return undefined;

  const email = optionalHeader(headers, "x-cycle-actor-email");
  const provider = optionalHeader(headers, "x-cycle-actor-provider");

  return {
    ...(email === undefined ? {} : { email }),
    name,
    ...(provider === undefined ? {} : { provider }),
    type,
  };
};

export const meta = (requestId: string, headers?: Headers.Headers): UseCaseMeta => {
  const actor = actorFromHeaders(headers);

  return {
    ...(actor === undefined ? {} : { actor }),
    requestId,
    source: optionalHeader(headers, "x-cycle-source") ?? "api",
  };
};

export const scoped = <T>(
  repositoryId: string,
  input: T,
): { readonly input: T; readonly repository: { readonly id: string } } => ({
  input,
  repository: { id: repositoryId },
});
