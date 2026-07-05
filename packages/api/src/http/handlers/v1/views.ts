import { ContractSchemas } from "@cycle/contracts";
import { ViewCreate, ViewDelete, ViewGet, ViewList, ViewUpdate } from "@cycle/usecases";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import { CycleRequestContext } from "../../middleware/CycleRequestContextMiddleware.ts";
import { urlFromRequest, viewQueryFrom } from "../query.ts";
import { errorResponse, resourceResponse } from "../responses.ts";
import {
  decodeHttpValue,
  meta,
  pagedUseCaseResponse,
  runUseCase,
  scoped,
  useCaseInvocation,
} from "../usecases.ts";
import type { V1Request } from "./types.ts";

export const listViews = ({ params, request }: V1Request<"listViews">) =>
  pagedUseCaseResponse(request, (requestId) =>
    useCaseInvocation(
      ViewList,
      scoped(params.repositoryId, viewQueryFrom(urlFromRequest(request).searchParams)),
      meta(requestId),
    ),
  );

export const createView = ({ params, payload }: V1Request<"createView">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const input = yield* decodeHttpValue(ContractSchemas.CreateSavedViewInput, payload, requestId, {
      code: "INVALID_VIEW_PAYLOAD",
      message: "Invalid view payload.",
    });
    if (HttpServerResponse.isHttpServerResponse(input)) return input;
    const result = yield* runUseCase(
      ViewCreate,
      scoped(params.repositoryId, input),
      meta(requestId),
    );
    if (HttpServerResponse.isHttpServerResponse(result)) return result;

    return resourceResponse(requestId, 201, result);
  });

export const getView = ({ params }: V1Request<"getView">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const result = yield* runUseCase(
      ViewGet,
      scoped(params.repositoryId, { id: params.viewId }),
      meta(requestId),
    );
    if (HttpServerResponse.isHttpServerResponse(result)) return result;

    return result === null
      ? errorResponse(requestId, 404, "NOT_FOUND", "View not found.")
      : resourceResponse(requestId, 200, result);
  });

export const updateView = ({ params, payload }: V1Request<"updateView">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
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
      ViewUpdate,
      scoped(params.repositoryId, input),
      meta(requestId),
    );
    if (HttpServerResponse.isHttpServerResponse(result)) return result;

    return resourceResponse(requestId, 200, result);
  });

export const archiveView = ({ params }: V1Request<"archiveView">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const result = yield* runUseCase(
      ViewDelete,
      scoped(params.repositoryId, { id: params.viewId }),
      meta(requestId),
    );
    if (HttpServerResponse.isHttpServerResponse(result)) return result;

    return resourceResponse(requestId, 200, result);
  });
