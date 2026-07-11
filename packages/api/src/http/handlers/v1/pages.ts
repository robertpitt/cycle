import * as ContractSchemas from "@cycle/contracts/schemas";
import {
  CommentAdd,
  CommentList,
  PageArchive,
  PageCreate,
  PageGet,
  PageHistoryList,
  PageList,
  PageRestore,
  PageRevisionGet,
  PageUpdate,
} from "@cycle/usecases";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import { CycleRequestContext } from "../../middleware/CycleRequestContextMiddleware.ts";
import { asPage, pageLimitFrom, urlFromRequest } from "../query.ts";
import { collectionResponse, resourceResponse } from "../responses.ts";
import { decodeHttpValue, meta, objectPayload, runUseCase, scoped } from "../usecases.ts";
import type { V1Request } from "./types.ts";

export const listPages = ({ params, request }: V1Request<"listPages">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const url = urlFromRequest(request);
    const input = yield* decodeHttpValue(
      ContractSchemas.PageQuery,
      {
        archived: booleanValue(url.searchParams.get("archived")),
        cursor: url.searchParams.get("page[cursor]") ?? undefined,
        directory: url.searchParams.get("directory") ?? undefined,
        limit: pageLimitFrom(url.searchParams),
        recursive: booleanValue(url.searchParams.get("recursive")),
      },
      requestId,
      { code: "INVALID_PAGE_QUERY", message: "Invalid Page list query." },
    );
    if (HttpServerResponse.isHttpServerResponse(input)) return input;
    const value = yield* runUseCase(
      PageList,
      scoped(params.repositoryId, input),
      meta(requestId, request.headers),
    );
    if (HttpServerResponse.isHttpServerResponse(value)) return value;
    const result = asPage(value);

    return collectionResponse(
      requestId,
      url,
      result.entries,
      pageLimitFrom(url.searchParams),
      result.nextCursor,
    );
  });

export const createPage = ({ params, payload, request }: V1Request<"createPage">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const input = yield* decodeHttpValue(
      ContractSchemas.CreatePageInput,
      payload,
      requestId,
      { code: "INVALID_PAGE_PAYLOAD", message: "Invalid Page create payload." },
    );
    if (HttpServerResponse.isHttpServerResponse(input)) return input;
    const result = yield* runUseCase(
      PageCreate,
      scoped(params.repositoryId, input),
      meta(requestId, request.headers),
    );
    if (HttpServerResponse.isHttpServerResponse(result)) return result;
    return resourceResponse(requestId, 201, result);
  });

export const getPage = ({ params, request }: V1Request<"getPage">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const url = urlFromRequest(request);
    const input = yield* decodeHttpValue(
      ContractSchemas.PageGetInput,
      {
        includeArchived: booleanValue(url.searchParams.get("includeArchived")),
        pageId: params.pageId,
      },
      requestId,
      { code: "INVALID_PAGE_REQUEST", message: "Invalid Page request." },
    );
    if (HttpServerResponse.isHttpServerResponse(input)) return input;
    const result = yield* runUseCase(
      PageGet,
      scoped(params.repositoryId, input),
      meta(requestId, request.headers),
    );
    if (HttpServerResponse.isHttpServerResponse(result)) return result;
    return resourceResponse(requestId, 200, result);
  });

export const updatePage = ({ params, payload, request }: V1Request<"updatePage">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const input = yield* decodeHttpValue(
      ContractSchemas.UpdatePageInput,
      { ...objectPayload(payload), pageId: params.pageId },
      requestId,
      { code: "INVALID_PAGE_PAYLOAD", message: "Invalid Page update payload." },
    );
    if (HttpServerResponse.isHttpServerResponse(input)) return input;
    const result = yield* runUseCase(
      PageUpdate,
      scoped(params.repositoryId, input),
      meta(requestId, request.headers),
    );
    if (HttpServerResponse.isHttpServerResponse(result)) return result;
    return resourceResponse(requestId, 200, result);
  });

export const archivePage = ({ params, payload, request }: V1Request<"archivePage">) =>
  pageStateMutation(
    PageArchive,
    ContractSchemas.ArchivePageInput,
    params,
    objectPayload(payload),
    request,
    "archive",
  );

export const restorePage = ({ params, payload, request }: V1Request<"restorePage">) =>
  pageStateMutation(
    PageRestore,
    ContractSchemas.RestorePageInput,
    params,
    objectPayload(payload),
    request,
    "restore",
  );

export const listPageHistory = ({ params, request }: V1Request<"listPageHistory">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const url = urlFromRequest(request);
    const input = yield* decodeHttpValue(
      ContractSchemas.PageHistoryInput,
      {
        cursor: url.searchParams.get("page[cursor]") ?? undefined,
        limit: pageLimitFrom(url.searchParams),
        pageId: params.pageId,
      },
      requestId,
      { code: "INVALID_PAGE_HISTORY_QUERY", message: "Invalid Page history query." },
    );
    if (HttpServerResponse.isHttpServerResponse(input)) return input;
    const value = yield* runUseCase(
      PageHistoryList,
      scoped(params.repositoryId, input),
      meta(requestId, request.headers),
    );
    if (HttpServerResponse.isHttpServerResponse(value)) return value;
    const result = asPage(value);
    return collectionResponse(
      requestId,
      url,
      result.entries,
      pageLimitFrom(url.searchParams),
      result.nextCursor,
    );
  });

export const getPageRevision = ({ params, request }: V1Request<"getPageRevision">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const input = yield* decodeHttpValue(
      ContractSchemas.PageRevisionInput,
      { pageId: params.pageId, snapshotId: params.snapshotId },
      requestId,
      { code: "INVALID_PAGE_REVISION", message: "Invalid Page revision request." },
    );
    if (HttpServerResponse.isHttpServerResponse(input)) return input;
    const result = yield* runUseCase(
      PageRevisionGet,
      scoped(params.repositoryId, input),
      meta(requestId, request.headers),
    );
    if (HttpServerResponse.isHttpServerResponse(result)) return result;
    return resourceResponse(requestId, 200, result);
  });

export const listPageComments = ({ params, request }: V1Request<"listPageComments">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const url = urlFromRequest(request);
    const input = yield* decodeHttpValue(
      ContractSchemas.CommentListInput,
      {
        query: {
          cursor: url.searchParams.get("page[cursor]") ?? undefined,
          limit: pageLimitFrom(url.searchParams),
        },
        target: pageTarget(params.repositoryId, params.pageId),
      },
      requestId,
      { code: "INVALID_COMMENT_QUERY", message: "Invalid Page comment query." },
    );
    if (HttpServerResponse.isHttpServerResponse(input)) return input;
    const value = yield* runUseCase(
      CommentList,
      scoped(params.repositoryId, input),
      meta(requestId, request.headers),
    );
    if (HttpServerResponse.isHttpServerResponse(value)) return value;
    const result = asPage(value);
    return collectionResponse(
      requestId,
      url,
      result.entries,
      pageLimitFrom(url.searchParams),
      result.nextCursor,
    );
  });

export const addPageComment = ({ params, payload, request }: V1Request<"addPageComment">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const input = yield* decodeHttpValue(
      ContractSchemas.CommentAddInput,
      { body: payload.body, target: pageTarget(params.repositoryId, params.pageId) },
      requestId,
      { code: "INVALID_COMMENT_PAYLOAD", message: "Invalid Page comment payload." },
    );
    if (HttpServerResponse.isHttpServerResponse(input)) return input;
    const result = yield* runUseCase(
      CommentAdd,
      scoped(params.repositoryId, input),
      meta(requestId, request.headers),
    );
    if (HttpServerResponse.isHttpServerResponse(result)) return result;
    return resourceResponse(requestId, 201, result);
  });

const pageStateMutation = (
  useCase: typeof PageArchive | typeof PageRestore,
  schema: typeof ContractSchemas.ArchivePageInput | typeof ContractSchemas.RestorePageInput,
  params: { readonly pageId: string; readonly repositoryId: string },
  payload: Readonly<Record<string, unknown>>,
  request: { readonly headers: Readonly<Record<string, string | undefined>> },
  operation: "archive" | "restore",
) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const input = yield* decodeHttpValue(
      schema,
      { ...payload, pageId: params.pageId },
      requestId,
      { code: `INVALID_PAGE_${operation.toUpperCase()}`, message: `Invalid Page ${operation} payload.` },
    );
    if (HttpServerResponse.isHttpServerResponse(input)) return input;
    const result = yield* runUseCase(
      useCase as never,
      scoped(params.repositoryId, input) as never,
      meta(requestId, request.headers),
    );
    if (HttpServerResponse.isHttpServerResponse(result)) return result;
    return resourceResponse(requestId, 200, result);
  });

const pageTarget = (repositoryId: string, pageId: string) => ({
  repositoryId,
  resourceId: pageId,
  resourceKind: "page" as const,
});

const booleanValue = (value: string | null): boolean | undefined =>
  value === "true" ? true : value === "false" ? false : undefined;
