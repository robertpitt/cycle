import { DraftCommit, DraftCreate, DraftUpdate } from "@cycle/contracts";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import { meta, requestIdFromHeaders, resourceResponse, runUseCase, scoped } from "../shared.ts";

export const withDraftHandlers = (handlers: any) =>
  handlers
    .handle("createDraft", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          DraftCreate(scoped(params.repositoryId, payload as any), meta(requestId)),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 201, result);
      }),
    )
    .handle("updateDraft", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          DraftUpdate(
            scoped(params.repositoryId, {
              ...payload,
              draftId: params.draftId,
            }),
            meta(requestId),
          ),
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
