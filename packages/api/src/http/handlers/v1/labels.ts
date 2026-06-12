import { LabelArchive, LabelList, LabelUpsert } from "@cycle/contracts";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import {
  labelQueryFrom,
  meta,
  pagedUseCaseResponse,
  requestIdFromHeaders,
  resourceResponse,
  runUseCase,
  scoped,
  urlFromRequest,
} from "../shared.ts";

export const withLabelHandlers = (handlers: any) =>
  handlers
    .handle("listLabels", ({ params, request }: any) =>
      pagedUseCaseResponse(request, (requestId) =>
        LabelList(
          scoped(params.repositoryId, labelQueryFrom(urlFromRequest(request).searchParams)),
          meta(requestId),
        ),
      ),
    )
    .handle("upsertLabel", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          LabelUpsert(
            scoped(params.repositoryId, {
              ...payload,
              id: params.labelId,
            } as any),
            meta(requestId),
          ),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    )
    .handle("archiveLabel", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          LabelArchive(scoped(params.repositoryId, { id: params.labelId }), meta(requestId)),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    );
