import {
  TemplateArchive,
  TemplateCreate,
  TemplateGet,
  TemplateList,
  TemplateUpdate,
} from "@cycle/contracts";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import {
  errorResponse,
  meta,
  pagedUseCaseResponse,
  requestIdFromHeaders,
  resourceResponse,
  runUseCase,
  scoped,
  templateQueryFrom,
  urlFromRequest,
} from "../shared.ts";

export const withTemplateHandlers = (handlers: any) =>
  handlers
    .handle("listTemplates", ({ params, request }: any) =>
      pagedUseCaseResponse(request, (requestId) =>
        TemplateList(
          scoped(params.repositoryId, templateQueryFrom(urlFromRequest(request).searchParams)),
          meta(requestId),
        ),
      ),
    )
    .handle("createTemplate", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          TemplateCreate(scoped(params.repositoryId, payload as any), meta(requestId)),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 201, result);
      }),
    )
    .handle("getTemplate", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          TemplateGet(scoped(params.repositoryId, { id: params.templateId }), meta(requestId)),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return result === null
          ? errorResponse(requestId, 404, "NOT_FOUND", "Template not found.")
          : resourceResponse(requestId, 200, result);
      }),
    )
    .handle("updateTemplate", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          TemplateUpdate(
            scoped(params.repositoryId, {
              id: params.templateId,
              patch: payload,
            }),
            meta(requestId),
          ),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    )
    .handle("archiveTemplate", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          TemplateArchive(scoped(params.repositoryId, { id: params.templateId }), meta(requestId)),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    );
