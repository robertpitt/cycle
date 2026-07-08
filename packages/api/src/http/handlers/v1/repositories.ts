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
import { CycleRequestContext } from "../../middleware/CycleRequestContextMiddleware.ts";
import {
  arrayPageFrom,
  asPage,
  filterRepositories,
  historyQueryFrom,
  pageLimitFrom,
  urlFromRequest,
} from "../query.ts";
import { collectionResponse, resourceResponse } from "../responses.ts";
import { meta, repositoryOpenInputFrom, runUseCase, scoped } from "../usecases.ts";
import type { V1Request } from "./types.ts";

export const status = () =>
  Effect.gen(function* () {
    const runtime = yield* CycleApiRuntime;
    const { requestId } = yield* CycleRequestContext;
    const repositories = yield* runUseCase(RepositoryList, {}, meta(requestId));
    if (HttpServerResponse.isHttpServerResponse(repositories)) return repositories;

    return resourceResponse(requestId, 200, {
      apiVersion: runtime.apiVersion,
      repositoriesMounted: Array.isArray(repositories) ? repositories.length : 0,
      runtime: "local",
      startedAt: runtime.startedAt,
      status: "ok",
    });
  });

export const listRepositories = ({ request }: V1Request<"listRepositories">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const repositories = (yield* runUseCase(
      RepositoryList,
      {},
      meta(requestId),
    )) as ReadonlyArray<RepositoryStatus>;
    if (HttpServerResponse.isHttpServerResponse(repositories)) return repositories;
    const url = urlFromRequest(request);
    const filtered = filterRepositories(repositories, url.searchParams);
    const page = arrayPageFrom(filtered, url.searchParams);

    return collectionResponse(requestId, url, page.entries, page.limit, page.nextCursor);
  });

export const openRepository = ({ payload }: V1Request<"openRepository">) =>
  Effect.gen(function* () {
    const runtime = yield* CycleApiRuntime;
    const { requestId } = yield* CycleRequestContext;
    const input = yield* repositoryOpenInputFrom(payload, requestId);
    if (HttpServerResponse.isHttpServerResponse(input)) return input;
    const result = yield* runUseCase(RepositoryOpen, input, meta(requestId));
    if (HttpServerResponse.isHttpServerResponse(result)) return result;

    return resourceResponse(requestId, 201, result);
  });

export const getRepository = ({ params }: V1Request<"getRepository">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const result = yield* runUseCase(
      RepositoryStatusGet,
      scoped(params.repositoryId, {}),
      meta(requestId),
    );
    if (HttpServerResponse.isHttpServerResponse(result)) return result;

    return resourceResponse(requestId, 200, result);
  });

export const listRepositoryWarnings = ({ params, request }: V1Request<"listRepositoryWarnings">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const url = urlFromRequest(request);
    const warnings = yield* runUseCase(
      RepositoryMaterializationWarningsList,
      scoped(params.repositoryId, {}),
      meta(requestId),
    );
    if (HttpServerResponse.isHttpServerResponse(warnings)) return warnings;

    const entries = Array.isArray(warnings) ? warnings : [];
    const page = arrayPageFrom(entries, url.searchParams);
    return collectionResponse(requestId, url, page.entries, page.limit, page.nextCursor);
  });

export const listRepositoryHistory = ({ params, request }: V1Request<"listRepositoryHistory">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
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
  });

export const syncRepository = ({ params }: V1Request<"syncRepository">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const result = yield* runUseCase(
      RepositorySync,
      scoped(params.repositoryId, {}),
      meta(requestId),
    );
    if (HttpServerResponse.isHttpServerResponse(result)) return result;

    return resourceResponse(requestId, 202, result);
  });

export const pushRepository = ({ params }: V1Request<"pushRepository">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const result = yield* runUseCase(
      RepositoryPush,
      scoped(params.repositoryId, {}),
      meta(requestId),
    );
    if (HttpServerResponse.isHttpServerResponse(result)) return result;

    return resourceResponse(requestId, 202, result);
  });
