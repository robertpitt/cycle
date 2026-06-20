import { Effect } from "effect";
import {
  HttpEffect,
  HttpRouter,
  HttpServerRequest,
  type HttpServerResponse,
} from "effect/unstable/http";
import { errorResponse } from "./shared.ts";

const isEmptyBadRequest = (response: HttpServerResponse.HttpServerResponse): boolean =>
  response.status === 400 && response.body._tag === "Empty";

const requestIdFromRequest = (request: HttpServerRequest.HttpServerRequest): string => {
  const requestId = request.headers["x-request-id"];
  if (requestId !== undefined && requestId.length > 0) return requestId;
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid === undefined ? "req_unknown" : `req_${uuid}`;
};

const normalizeFrameworkResponse = (
  request: HttpServerRequest.HttpServerRequest,
  response: HttpServerResponse.HttpServerResponse,
): HttpServerResponse.HttpServerResponse => {
  if (!isEmptyBadRequest(response)) return response;

  return errorResponse(
    requestIdFromRequest(request),
    400,
    "INVALID_REQUEST",
    "Request payload, params, or query did not match the API schema.",
    false,
  );
};

export const FrameworkErrorEnvelopeLive = HttpRouter.use((router) =>
  router.addGlobalMiddleware((effect) =>
    HttpEffect.withPreResponseHandler(effect, (request, response) =>
      Effect.succeed(normalizeFrameworkResponse(request, response)),
    ),
  ),
);
