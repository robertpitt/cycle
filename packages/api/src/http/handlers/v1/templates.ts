import { ContractSchemas } from "@cycle/contracts";
import {
  TemplateArchive,
  TemplateCreate,
  TemplateGet,
  TemplateList,
  TemplateUpdate,
} from "@cycle/usecases";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import { CycleRequestContext } from "../../middleware/CycleRequestContextMiddleware.ts";
import { templateQueryFrom, urlFromRequest } from "../query.ts";
import { errorResponse, resourceResponse } from "../responses.ts";
import {
  decodeHttpValue,
  meta,
  pagedUseCaseResponse,
  runUseCase,
  scoped,
  useCaseInvocation,
} from "../usecases.ts";
import type { V1Request } from "./types.ts";

export const listTemplates = ({ params, request }: V1Request<"listTemplates">) =>
  pagedUseCaseResponse(request, (requestId) =>
    useCaseInvocation(
      TemplateList,
      scoped(params.repositoryId, templateQueryFrom(urlFromRequest(request).searchParams)),
      meta(requestId),
    ),
  );

export const createTemplate = ({ params, payload }: V1Request<"createTemplate">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const input = yield* decodeHttpValue(
      ContractSchemas.CreateIssueTemplateInput,
      payload,
      requestId,
      {
        code: "INVALID_TEMPLATE_PAYLOAD",
        message: "Invalid template payload.",
      },
    );
    if (HttpServerResponse.isHttpServerResponse(input)) return input;
    const result = yield* runUseCase(
      TemplateCreate,
      scoped(params.repositoryId, input),
      meta(requestId),
    );
    if (HttpServerResponse.isHttpServerResponse(result)) return result;

    return resourceResponse(requestId, 201, result);
  });

export const getTemplate = ({ params }: V1Request<"getTemplate">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const result = yield* runUseCase(
      TemplateGet,
      scoped(params.repositoryId, { id: params.templateId }),
      meta(requestId),
    );
    if (HttpServerResponse.isHttpServerResponse(result)) return result;

    return result === null
      ? errorResponse(requestId, 404, "NOT_FOUND", "Template not found.")
      : resourceResponse(requestId, 200, result);
  });

export const updateTemplate = ({ params, payload }: V1Request<"updateTemplate">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const input = yield* decodeHttpValue(
      ContractSchemas.UpdateTemplateRequestInput,
      {
        id: params.templateId,
        patch: payload,
      },
      requestId,
      {
        code: "INVALID_TEMPLATE_PAYLOAD",
        message: "Invalid template payload.",
      },
    );
    if (HttpServerResponse.isHttpServerResponse(input)) return input;
    const result = yield* runUseCase(
      TemplateUpdate,
      scoped(params.repositoryId, input),
      meta(requestId),
    );
    if (HttpServerResponse.isHttpServerResponse(result)) return result;

    return resourceResponse(requestId, 200, result);
  });

export const archiveTemplate = ({ params }: V1Request<"archiveTemplate">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const result = yield* runUseCase(
      TemplateArchive,
      scoped(params.repositoryId, { id: params.templateId }),
      meta(requestId),
    );
    if (HttpServerResponse.isHttpServerResponse(result)) return result;

    return resourceResponse(requestId, 200, result);
  });
