import * as ContractSchemas from "@cycle/contracts/schemas";
import { DraftCommit, DraftCreate, DraftList, DraftUpdate } from "@cycle/usecases";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import { CycleRequestContext } from "../../middleware/CycleRequestContextMiddleware.ts";
import { collectionResponse, resourceResponse } from "../responses.ts";
import { urlFromRequest } from "../query.ts";
import { decodeHttpValue, meta, runUseCase, scoped } from "../usecases.ts";
import type { V1Request } from "./types.ts";

export const listDrafts = ({ params, request }: V1Request<"listDrafts">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const result = yield* runUseCase(DraftList, scoped(params.repositoryId, {}), meta(requestId));
    if (HttpServerResponse.isHttpServerResponse(result)) return result;
    const drafts = result as ReadonlyArray<ContractSchemas.TicketDraftDocument>;

    return collectionResponse(requestId, urlFromRequest(request), drafts, drafts.length, null);
  });

export const createDraft = ({ params, payload }: V1Request<"createDraft">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const input = yield* decodeHttpValue(ContractSchemas.CreateDraftInput, payload, requestId, {
      code: "INVALID_DRAFT_PAYLOAD",
      message: "Invalid draft payload.",
    });
    if (HttpServerResponse.isHttpServerResponse(input)) return input;
    const result = yield* runUseCase(
      DraftCreate,
      scoped(params.repositoryId, input),
      meta(requestId),
    );
    if (HttpServerResponse.isHttpServerResponse(result)) return result;

    return resourceResponse(requestId, 201, result);
  });

export const updateDraft = ({ params, payload }: V1Request<"updateDraft">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
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
      DraftUpdate,
      scoped(params.repositoryId, input),
      meta(requestId),
    );
    if (HttpServerResponse.isHttpServerResponse(result)) return result;

    return resourceResponse(requestId, 200, result);
  });

export const commitDraft = ({ params }: V1Request<"commitDraft">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const result = yield* runUseCase(
      DraftCommit,
      scoped(params.repositoryId, params.draftId),
      meta(requestId),
    );
    if (HttpServerResponse.isHttpServerResponse(result)) return result;

    return resourceResponse(requestId, 200, result);
  });
