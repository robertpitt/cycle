import { ViewCreate, ViewDelete, ViewGet, ViewList, ViewUpdate } from "@cycle/contracts";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import {
  errorResponse,
  meta,
  pagedUseCaseResponse,
  requestIdFromHeaders,
  resourceResponse,
  runUseCase,
  scoped,
  urlFromRequest,
  viewQueryFrom,
} from "../shared.ts";

export const withViewHandlers = (handlers: any) =>
  handlers
    .handle("listViews", ({ params, request }: any) =>
      pagedUseCaseResponse(request, (requestId) =>
        ViewList(
          scoped(params.repositoryId, viewQueryFrom(urlFromRequest(request).searchParams)),
          meta(requestId),
        ),
      ),
    )
    .handle("createView", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          ViewCreate(scoped(params.repositoryId, payload as any), meta(requestId)),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 201, result);
      }),
    )
    .handle("getView", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          ViewGet(scoped(params.repositoryId, { id: params.viewId }), meta(requestId)),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return result === null
          ? errorResponse(requestId, 404, "NOT_FOUND", "View not found.")
          : resourceResponse(requestId, 200, result);
      }),
    )
    .handle("updateView", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          ViewUpdate(
            scoped(params.repositoryId, {
              id: params.viewId,
              patch: payload,
            }),
            meta(requestId),
          ),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    )
    .handle("archiveView", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          ViewDelete(scoped(params.repositoryId, { id: params.viewId }), meta(requestId)),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    );
