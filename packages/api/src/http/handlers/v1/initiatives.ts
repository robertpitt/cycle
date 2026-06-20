import {
  InitiativeCreate,
  InitiativeProgressGet,
  InitiativeUpdateAdd,
  contractFor,
} from "@cycle/contracts";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import {
  decodeHttpValue,
  meta,
  requestIdFromHeaders,
  resourceResponse,
  runUseCase,
  scoped,
} from "../shared.ts";

export const withInitiativeHandlers = (handlers: any) =>
  handlers
    .handle("createInitiative", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const input = yield* decodeHttpValue(
          contractFor("InitiativeCreate").inputSchema,
          scoped(params.repositoryId, payload),
          requestId,
          {
            code: "INVALID_INITIATIVE_PAYLOAD",
            message: "Invalid initiative payload.",
          },
        );
        if (HttpServerResponse.isHttpServerResponse(input)) return input;
        const result = yield* runUseCase(InitiativeCreate(input, meta(requestId)));
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 201, result);
      }),
    )
    .handle("getInitiativeProgress", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const input = yield* decodeHttpValue(
          contractFor("InitiativeProgressGet").inputSchema,
          scoped(params.repositoryId, { id: params.initiativeId }),
          requestId,
          {
            code: "INVALID_INITIATIVE_QUERY",
            message: "Invalid initiative progress request.",
          },
        );
        if (HttpServerResponse.isHttpServerResponse(input)) return input;
        const result = yield* runUseCase(InitiativeProgressGet(input, meta(requestId)));
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    )
    .handle("addInitiativeUpdate", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const input = yield* decodeHttpValue(
          contractFor("InitiativeUpdateAdd").inputSchema,
          scoped(params.repositoryId, {
            id: params.initiativeId,
            update: payload,
          }),
          requestId,
          {
            code: "INVALID_INITIATIVE_UPDATE_PAYLOAD",
            message: "Invalid initiative update payload.",
          },
        );
        if (HttpServerResponse.isHttpServerResponse(input)) return input;
        const result = yield* runUseCase(InitiativeUpdateAdd(input, meta(requestId)));
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 201, result);
      }),
    );
