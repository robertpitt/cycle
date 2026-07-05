import { InitiativeCreate, InitiativeProgressGet, InitiativeUpdateAdd } from "@cycle/usecases";
import { contractFor } from "@cycle/usecases/contracts";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import { CycleRequestContext } from "../../middleware/CycleRequestContextMiddleware.ts";
import { resourceResponse } from "../responses.ts";
import { decodeHttpValue, meta, runUseCase, scoped } from "../usecases.ts";
import type { V1Request } from "./types.ts";

export const createInitiative = ({ params, payload }: V1Request<"createInitiative">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
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
    const result = yield* runUseCase(InitiativeCreate, input, meta(requestId));
    if (HttpServerResponse.isHttpServerResponse(result)) return result;

    return resourceResponse(requestId, 201, result);
  });

export const getInitiativeProgress = ({ params }: V1Request<"getInitiativeProgress">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
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
    const result = yield* runUseCase(InitiativeProgressGet, input, meta(requestId));
    if (HttpServerResponse.isHttpServerResponse(result)) return result;

    return resourceResponse(requestId, 200, result);
  });

export const addInitiativeUpdate = ({ params, payload }: V1Request<"addInitiativeUpdate">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
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
    const result = yield* runUseCase(InitiativeUpdateAdd, input, meta(requestId));
    if (HttpServerResponse.isHttpServerResponse(result)) return result;

    return resourceResponse(requestId, 201, result);
  });
