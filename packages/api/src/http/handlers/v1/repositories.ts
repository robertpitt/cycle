import { type RepositoryStatus } from "@cycle/contracts";
import {
  RepositoryHistoryList,
  RepositoryList,
  RepositoryMaterializationWarningsList,
  RepositoryOpen,
  RepositoryPush,
  RepositoryStatusGet,
  RepositorySync,
} from "@cycle/usecases";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import { CycleApiRuntime } from "../../runtime/CycleApiRuntime.ts";
import {
  collectionResponse,
  filterRepositories,
  historyQueryFrom,
  meta,
  pageLimitFrom,
  repositoryOpenInputFrom,
  requestIdFromHeaders,
  resourceResponse,
  runUseCase,
  scoped,
  urlFromRequest,
  asPage,
} from "../shared.ts";

export const withRepositoryHandlers = (handlers: any) =>
  handlers
    .handle("status", ({ request }: any) =>
      Effect.gen(function* () {
        const runtime = yield* CycleApiRuntime;
        const requestId = yield* requestIdFromHeaders(request.headers);
        const repositories = yield* runUseCase(RepositoryList, {}, meta(requestId));
        if (HttpServerResponse.isHttpServerResponse(repositories)) return repositories;

        return resourceResponse(requestId, 200, {
          apiVersion: runtime.apiVersion,
          repositoriesMounted: Array.isArray(repositories) ? repositories.length : 0,
          runtime: "local",
          startedAt: runtime.startedAt,
          status: "ok",
        });
      }),
    )
    .handle("listRepositories", ({ request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const repositories = (yield* runUseCase(
          RepositoryList,
          {},
          meta(requestId),
        )) as ReadonlyArray<RepositoryStatus>;
        if (HttpServerResponse.isHttpServerResponse(repositories)) return repositories;
        const url = urlFromRequest(request);
        const filtered = filterRepositories(repositories, url.searchParams);

        return collectionResponse(requestId, url, filtered, filtered.length, null);
      }),
    )
    .handle("openRepository", ({ payload, request }: any) =>
      Effect.gen(function* () {
        const runtime = yield* CycleApiRuntime;
        const requestId = yield* requestIdFromHeaders(request.headers);
        const input = yield* repositoryOpenInputFrom(runtime, payload, requestId);
        if (HttpServerResponse.isHttpServerResponse(input)) return input;
        const result = yield* runUseCase(RepositoryOpen, input, meta(requestId));
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 201, result);
      }),
    )
    .handle("getRepository", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          RepositoryStatusGet,
          scoped(params.repositoryId, {}),
          meta(requestId),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    )
    .handle("listRepositoryWarnings", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const url = urlFromRequest(request);
        const warnings = yield* runUseCase(
          RepositoryMaterializationWarningsList,
          scoped(params.repositoryId, {}),
          meta(requestId),
        );
        if (HttpServerResponse.isHttpServerResponse(warnings)) return warnings;

        const entries = Array.isArray(warnings) ? warnings : [];
        return collectionResponse(requestId, url, entries, entries.length, null);
      }),
    )
    .handle("listRepositoryHistory", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const url = urlFromRequest(request);
        const pageValue = yield* runUseCase(
          RepositoryHistoryList,
          scoped(params.repositoryId, historyQueryFrom(url.searchParams)),
          meta(requestId),
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
      }),
    )
    .handle("syncRepository", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          RepositorySync,
          scoped(params.repositoryId, {}),
          meta(requestId),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 202, result);
      }),
    )
    .handle("pushRepository", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          RepositoryPush,
          scoped(params.repositoryId, {}),
          meta(requestId),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 202, result);
      }),
    );
