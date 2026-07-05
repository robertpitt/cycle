import { ContractSchemas } from "@cycle/contracts";
import { LabelArchive, LabelList, LabelUpsert } from "@cycle/usecases";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import { CycleRequestContext } from "../../middleware/CycleRequestContextMiddleware.ts";
import { labelQueryFrom, urlFromRequest } from "../query.ts";
import { resourceResponse } from "../responses.ts";
import {
  decodeHttpValue,
  meta,
  objectPayload,
  pagedUseCaseResponse,
  runUseCase,
  scoped,
  useCaseInvocation,
} from "../usecases.ts";
import type { V1Request } from "./types.ts";

export const listLabels = ({ params, request }: V1Request<"listLabels">) =>
  pagedUseCaseResponse(request, (requestId) =>
    useCaseInvocation(
      LabelList,
      scoped(params.repositoryId, labelQueryFrom(urlFromRequest(request).searchParams)),
      meta(requestId),
    ),
  );

export const upsertLabel = ({ params, payload }: V1Request<"upsertLabel">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const input = yield* decodeHttpValue(
      ContractSchemas.UpsertLabelInput,
      {
        ...objectPayload(payload),
        id: params.labelId,
      },
      requestId,
      {
        code: "INVALID_LABEL_PAYLOAD",
        message: "Invalid label payload.",
      },
    );
    if (HttpServerResponse.isHttpServerResponse(input)) return input;
    const result = yield* runUseCase(
      LabelUpsert,
      scoped(params.repositoryId, input),
      meta(requestId),
    );
    if (HttpServerResponse.isHttpServerResponse(result)) return result;

    return resourceResponse(requestId, 200, result);
  });

export const archiveLabel = ({ params }: V1Request<"archiveLabel">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const result = yield* runUseCase(
      LabelArchive,
      scoped(params.repositoryId, { id: params.labelId }),
      meta(requestId),
    );
    if (HttpServerResponse.isHttpServerResponse(result)) return result;

    return resourceResponse(requestId, 200, result);
  });
