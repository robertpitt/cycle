import {
  IssueArchive,
  IssueCreate,
  IssueDiff,
  IssueGet,
  IssueHistoryList,
  IssueList,
  IssueRelationAdd,
  IssueRelationRemove,
  IssueRestore,
  IssueRevisionGet,
  IssueSearch,
  IssueTransition,
  IssueUpdate,
  RecordAdd,
  RecordListForIssue,
} from "@cycle/contracts";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import {
  asPage,
  collectionResponse,
  errorResponse,
  historyQueryFrom,
  issueQueryFrom,
  meta,
  optionalString,
  pageLimitFrom,
  recordQueryFrom,
  requestIdFromHeaders,
  resourceResponse,
  runUseCase,
  scoped,
  stringField,
  urlFromRequest,
} from "../shared.ts";

export const withIssueHandlers = (handlers: any) =>
  handlers
    .handle("listIssues", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const url = urlFromRequest(request);
        const query = issueQueryFrom(url.searchParams);
        const useCase =
          typeof query.text === "string" && query.text.length > 0
            ? IssueSearch(
                scoped(params.repositoryId, {
                  cursor: query["cursor"] as string | undefined,
                  limit: query["limit"] as number | undefined,
                  repositoryIds: query["repositoryIds"] as ReadonlyArray<string> | undefined,
                  text: query["text"] as string,
                }),
                meta(requestId),
              )
            : IssueList(scoped(params.repositoryId, query), meta(requestId));
        const pageValue = yield* runUseCase(useCase);
        if (HttpServerResponse.isHttpServerResponse(pageValue)) return pageValue;
        const result = asPage(pageValue);

        return collectionResponse(
          requestId,
          url,
          result.entries,
          pageLimitFrom(url.searchParams),
          result.nextCursor,
        );
      }),
    )
    .handle("createIssue", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          IssueCreate(scoped(params.repositoryId, payload as any), meta(requestId)),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 201, result);
      }),
    )
    .handle("getIssue", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          IssueGet(scoped(params.repositoryId, { id: params.issueId }), meta(requestId)),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return result === null
          ? errorResponse(requestId, 404, "NOT_FOUND", "Issue not found.")
          : resourceResponse(requestId, 200, result);
      }),
    )
    .handle("updateIssue", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          IssueUpdate(
            scoped(params.repositoryId, {
              id: params.issueId,
              patch: payload,
            }),
            meta(requestId),
          ),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    )
    .handle("transitionIssue", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          IssueTransition(
            scoped(params.repositoryId, {
              id: params.issueId,
              reason: payload.reason,
              status: payload.status,
            }),
            meta(requestId),
          ),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    )
    .handle("archiveIssue", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          IssueArchive(
            scoped(params.repositoryId, {
              id: params.issueId,
              reason: optionalString(payload.reason),
            }),
            meta(requestId),
          ),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    )
    .handle("restoreIssue", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          IssueRestore(
            scoped(params.repositoryId, {
              id: params.issueId,
              reason: optionalString(payload.reason),
            }),
            meta(requestId),
          ),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    )
    .handle("listIssueHistory", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const url = urlFromRequest(request);
        const pageValue = yield* runUseCase(
          IssueHistoryList(
            scoped(params.repositoryId, {
              id: params.issueId,
              options: historyQueryFrom(url.searchParams),
            }),
            meta(requestId),
          ),
        );
        if (HttpServerResponse.isHttpServerResponse(pageValue)) return pageValue;
        const result = asPage(pageValue);

        return collectionResponse(
          requestId,
          url,
          result.entries,
          pageLimitFrom(url.searchParams),
          result.nextCursor,
        );
      }),
    )
    .handle("getIssueRevision", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          IssueRevisionGet(
            scoped(params.repositoryId, {
              id: params.issueId,
              snapshotId: params.snapshotId,
            }),
            meta(requestId),
          ),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return result === null
          ? errorResponse(requestId, 404, "NOT_FOUND", "Issue revision not found.")
          : resourceResponse(requestId, 200, result);
      }),
    )
    .handle("diffIssue", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const url = urlFromRequest(request);
        const fromSnapshotId =
          url.searchParams.get("fromSnapshotId") ?? url.searchParams.get("from");
        const toSnapshotId = url.searchParams.get("toSnapshotId") ?? url.searchParams.get("to");

        if (fromSnapshotId === null || toSnapshotId === null) {
          return errorResponse(
            requestId,
            400,
            "INVALID_QUERY",
            "Issue diff requires fromSnapshotId and toSnapshotId query parameters.",
          );
        }

        const result = yield* runUseCase(
          IssueDiff(
            scoped(params.repositoryId, {
              fromSnapshotId,
              id: params.issueId,
              toSnapshotId,
            }),
            meta(requestId),
          ),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    )
    .handle("addIssueRelation", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          IssueRelationAdd(
            scoped(params.repositoryId, {
              id: params.issueId,
              relation: payload,
            } as any),
            meta(requestId),
          ),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    )
    .handle("removeIssueRelation", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          IssueRelationRemove(
            scoped(params.repositoryId, {
              id: params.issueId,
              relation: payload,
            } as any),
            meta(requestId),
          ),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    )
    .handle("listIssueRecords", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const url = urlFromRequest(request);
        const pageValue = yield* runUseCase(
          RecordListForIssue(
            scoped(params.repositoryId, {
              issueId: params.issueId,
              query: recordQueryFrom(url.searchParams),
            }),
            meta(requestId),
          ),
        );
        if (HttpServerResponse.isHttpServerResponse(pageValue)) return pageValue;
        const result = asPage(pageValue);

        return collectionResponse(
          requestId,
          url,
          result.entries,
          pageLimitFrom(url.searchParams),
          result.nextCursor,
        );
      }),
    )
    .handle("addIssueRecord", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          RecordAdd(
            scoped(params.repositoryId, {
              issueId: params.issueId,
              payload: "payload" in payload ? payload.payload : payload,
              recordType: stringField(payload, "recordType", "note"),
              userVisible:
                typeof payload.userVisible === "boolean" ? payload.userVisible : undefined,
            }),
            meta(requestId),
          ),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 201, result);
      }),
    );
