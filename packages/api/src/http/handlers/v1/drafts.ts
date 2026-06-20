import { ContractSchemas, DraftCommit, DraftCreate, DraftUpdate } from "@cycle/contracts";
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

export const withDraftHandlers = (handlers: any) =>
  handlers
    .handle("createDraft", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const input = yield* decodeHttpValue(ContractSchemas.CreateDraftInput, payload, requestId, {
          code: "INVALID_DRAFT_PAYLOAD",
          message: "Invalid draft payload.",
        });
        if (HttpServerResponse.isHttpServerResponse(input)) return input;
        const result = yield* runUseCase(
          DraftCreate(scoped(params.repositoryId, input), meta(requestId)),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 201, result);
      }),
    )
    .handle("updateDraft", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const input = yield* decodeHttpValue(
          ContractSchemas.UpdateDraftInput,
          {
            ...(typeof payload === "object" && payload !== null && !Array.isArray(payload)
              ? payload
              : {}),
            draftId: params.draftId,
          },
          requestId,
          {
            code: "INVALID_DRAFT_PAYLOAD",
            message: "Invalid draft payload.",
          },
        );
        if (HttpServerResponse.isHttpServerResponse(input)) return input;
        const result = yield* runUseCase(
          DraftUpdate(scoped(params.repositoryId, input), meta(requestId)),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    )
    .handle("commitDraft", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          DraftCommit(scoped(params.repositoryId, params.draftId), meta(requestId)),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    );
