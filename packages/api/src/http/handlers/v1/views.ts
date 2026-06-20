import {
  ContractSchemas,
  ViewCreate,
  ViewDelete,
  ViewGet,
  ViewList,
  ViewUpdate,
} from "@cycle/contracts";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import {
  decodeHttpValue,
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
        const input = yield* decodeHttpValue(
          ContractSchemas.CreateSavedViewInput,
          payload,
          requestId,
          {
            code: "INVALID_VIEW_PAYLOAD",
            message: "Invalid view payload.",
          },
        );
        if (HttpServerResponse.isHttpServerResponse(input)) return input;
        const result = yield* runUseCase(
          ViewCreate(scoped(params.repositoryId, input), meta(requestId)),
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
        const input = yield* decodeHttpValue(
          ContractSchemas.UpdateViewRequestInput,
          {
            id: params.viewId,
            patch: payload,
          },
          requestId,
          {
            code: "INVALID_VIEW_PAYLOAD",
            message: "Invalid view payload.",
          },
        );
        if (HttpServerResponse.isHttpServerResponse(input)) return input;
        const result = yield* runUseCase(
          ViewUpdate(scoped(params.repositoryId, input), meta(requestId)),
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
