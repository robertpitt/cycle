import { InitiativeCreate, InitiativeProgressGet, InitiativeUpdateAdd } from "@cycle/contracts";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import { meta, requestIdFromHeaders, resourceResponse, runUseCase, scoped } from "../shared.ts";

export const withInitiativeHandlers = (handlers: any) =>
  handlers
    .handle("createInitiative", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          InitiativeCreate(scoped(params.repositoryId, payload as any), meta(requestId)),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 201, result);
      }),
    )
    .handle("getInitiativeProgress", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          InitiativeProgressGet(
            scoped(params.repositoryId, { id: params.initiativeId }),
            meta(requestId),
          ),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    )
    .handle("addInitiativeUpdate", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          InitiativeUpdateAdd(
            scoped(params.repositoryId, {
              id: params.initiativeId,
              update: payload,
            } as any),
            meta(requestId),
          ),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 201, result);
      }),
    );
