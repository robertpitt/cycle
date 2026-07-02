import {
  ContractSchemas,
} from "@cycle/contracts";
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
} from "@cycle/usecases";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import {
  asPage,
  collectionResponse,
  decodeHttpValue,
  errorResponse,
  historyQueryFrom,
  issueQueryFrom,
  meta,
  objectPayload,
  optionalString,
  pageLimitFrom,
  recordQueryFrom,
  requestIdFromHeaders,
  resourceResponse,
  runUseCase,
  scoped,
  stringField,
  useCaseInvocation,
  urlFromRequest,
} from "../shared.ts";
import { handleSuccessfulCommentMentions, idFromResult } from "./commentMentions.ts";

export const withIssueHandlers = (handlers: any) =>
  handlers
    .handle("listIssues", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const url = urlFromRequest(request);
        const query = yield* decodeHttpValue(
          ContractSchemas.IssueQuery,
          issueQueryFrom(url.searchParams),
          requestId,
          { code: "INVALID_ISSUE_QUERY", message: "Invalid issue query." },
        );
        if (HttpServerResponse.isHttpServerResponse(query)) return query;
        const useCase = (() => {
          if (typeof query.text !== "string" || query.text.length === 0) {
            return Effect.succeed(
              useCaseInvocation(IssueList, scoped(params.repositoryId, query), meta(requestId)),
            );
          }

          return decodeHttpValue(
            ContractSchemas.SearchTicketsInput,
            {
              cursor: query.cursor,
              limit: query.limit,
              repositoryIds: query.repositoryIds,
              text: query.text,
            },
            requestId,
            { code: "INVALID_ISSUE_SEARCH", message: "Invalid issue search query." },
          ).pipe(
            Effect.map((input) =>
              HttpServerResponse.isHttpServerResponse(input)
                ? input
                : useCaseInvocation(
                    IssueSearch,
                    scoped(params.repositoryId, input),
                    meta(requestId),
                  ),
            ),
          );
        })();
        const resolvedUseCase = yield* useCase;
        if (HttpServerResponse.isHttpServerResponse(resolvedUseCase)) return resolvedUseCase;
        const pageValue = yield* runUseCase(
          resolvedUseCase.definition,
          resolvedUseCase.input as never,
          resolvedUseCase.meta,
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
    .handle("createIssue", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const input = yield* decodeHttpValue(ContractSchemas.CreateIssueInput, payload, requestId, {
          code: "INVALID_ISSUE_PAYLOAD",
          message: "Invalid issue payload.",
        });
        if (HttpServerResponse.isHttpServerResponse(input)) return input;
        const result = yield* runUseCase(
          IssueCreate,
          scoped(params.repositoryId, input),
          meta(requestId),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 201, result);
      }),
    )
    .handle("getIssue", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          IssueGet,
          scoped(params.repositoryId, { id: params.issueId }),
          meta(requestId),
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
        const input = yield* decodeHttpValue(
          ContractSchemas.UpdateIssueRequestInput,
          {
            id: params.issueId,
            patch: payload,
          },
          requestId,
          { code: "INVALID_ISSUE_PAYLOAD", message: "Invalid issue payload." },
        );
        if (HttpServerResponse.isHttpServerResponse(input)) return input;
        const result = yield* runUseCase(
          IssueUpdate,
          scoped(params.repositoryId, input),
          meta(requestId),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    )
    .handle("transitionIssue", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const input = yield* decodeHttpValue(
          ContractSchemas.TransitionIssueInput,
          {
            ...objectPayload(payload),
            id: params.issueId,
          },
          requestId,
          { code: "INVALID_ISSUE_TRANSITION", message: "Invalid issue transition payload." },
        );
        if (HttpServerResponse.isHttpServerResponse(input)) return input;
        const result = yield* runUseCase(
          IssueTransition,
          scoped(params.repositoryId, input),
          meta(requestId),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    )
    .handle("archiveIssue", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const input = yield* decodeHttpValue(
          ContractSchemas.ArchiveIssueInput,
          {
            id: params.issueId,
            reason: optionalString(objectPayload(payload).reason),
          },
          requestId,
          { code: "INVALID_ISSUE_ARCHIVE", message: "Invalid issue archive payload." },
        );
        if (HttpServerResponse.isHttpServerResponse(input)) return input;
        const result = yield* runUseCase(
          IssueArchive,
          scoped(params.repositoryId, input),
          meta(requestId),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    )
    .handle("restoreIssue", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const input = yield* decodeHttpValue(
          ContractSchemas.RestoreIssueInput,
          {
            id: params.issueId,
            reason: optionalString(objectPayload(payload).reason),
          },
          requestId,
          { code: "INVALID_ISSUE_RESTORE", message: "Invalid issue restore payload." },
        );
        if (HttpServerResponse.isHttpServerResponse(input)) return input;
        const result = yield* runUseCase(
          IssueRestore,
          scoped(params.repositoryId, input),
          meta(requestId),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    )
    .handle("listIssueHistory", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const url = urlFromRequest(request);
        const input = yield* decodeHttpValue(
          ContractSchemas.IssueHistoryInput,
          {
            id: params.issueId,
            options: historyQueryFrom(url.searchParams),
          },
          requestId,
          { code: "INVALID_ISSUE_HISTORY_QUERY", message: "Invalid issue history query." },
        );
        if (HttpServerResponse.isHttpServerResponse(input)) return input;
        const pageValue = yield* runUseCase(
          IssueHistoryList,
          scoped(params.repositoryId, input),
          meta(requestId),
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
        const input = yield* decodeHttpValue(
          ContractSchemas.IssueRevisionInput,
          {
            id: params.issueId,
            snapshotId: params.snapshotId,
          },
          requestId,
          { code: "INVALID_ISSUE_REVISION", message: "Invalid issue revision request." },
        );
        if (HttpServerResponse.isHttpServerResponse(input)) return input;
        const result = yield* runUseCase(
          IssueRevisionGet,
          scoped(params.repositoryId, input),
          meta(requestId),
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
        const input = yield* decodeHttpValue(
          ContractSchemas.IssueDiffInput,
          {
            fromSnapshotId,
            id: params.issueId,
            toSnapshotId,
          },
          requestId,
          {
            code: "INVALID_ISSUE_DIFF_QUERY",
            message: "Issue diff requires fromSnapshotId and toSnapshotId query parameters.",
          },
        );
        if (HttpServerResponse.isHttpServerResponse(input)) return input;
        const result = yield* runUseCase(
          IssueDiff,
          scoped(params.repositoryId, input),
          meta(requestId),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    )
    .handle("addIssueRelation", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const input = yield* decodeHttpValue(
          ContractSchemas.RelationIssueInput,
          {
            id: params.issueId,
            relation: payload,
          },
          requestId,
          { code: "INVALID_ISSUE_RELATION", message: "Invalid issue relation payload." },
        );
        if (HttpServerResponse.isHttpServerResponse(input)) return input;
        const result = yield* runUseCase(
          IssueRelationAdd,
          scoped(params.repositoryId, input),
          meta(requestId),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    )
    .handle("removeIssueRelation", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const input = yield* decodeHttpValue(
          ContractSchemas.RelationIssueInput,
          {
            id: params.issueId,
            relation: payload,
          },
          requestId,
          { code: "INVALID_ISSUE_RELATION", message: "Invalid issue relation payload." },
        );
        if (HttpServerResponse.isHttpServerResponse(input)) return input;
        const result = yield* runUseCase(
          IssueRelationRemove,
          scoped(params.repositoryId, input),
          meta(requestId),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    )
    .handle("listIssueRecords", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const url = urlFromRequest(request);
        const input = yield* decodeHttpValue(
          ContractSchemas.RecordsForIssueInput,
          {
            issueId: params.issueId,
            query: recordQueryFrom(url.searchParams),
          },
          requestId,
          { code: "INVALID_RECORD_QUERY", message: "Invalid issue record query." },
        );
        if (HttpServerResponse.isHttpServerResponse(input)) return input;
        const pageValue = yield* runUseCase(
          RecordListForIssue,
          scoped(params.repositoryId, input),
          meta(requestId),
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
        const body = objectPayload(payload);
        const input = yield* decodeHttpValue(
          ContractSchemas.AddLinkedRecordInput,
          {
            issueId: params.issueId,
            payload: body.payload,
            recordType: stringField(body, "recordType", "note"),
            userVisible: typeof body.userVisible === "boolean" ? body.userVisible : undefined,
          },
          requestId,
          { code: "INVALID_RECORD_PAYLOAD", message: "Invalid issue record payload." },
        );
        if (HttpServerResponse.isHttpServerResponse(input)) return input;
        const result = yield* runUseCase(
          RecordAdd,
          scoped(params.repositoryId, input),
          meta(requestId),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;
        const commentBody = commentBodyFromRecordInput(input);
        if (commentBody !== undefined) {
          yield* handleSuccessfulCommentMentions({
            body: commentBody,
            comment: result,
            commentId: idFromResult(result, requestId),
            repositoryId: params.repositoryId,
            request,
            requestId,
            ticketId: params.issueId,
          });
        }

        return resourceResponse(requestId, 201, result);
      }),
    );

const commentBodyFromRecordInput = (input: {
  readonly payload: unknown;
  readonly recordType: string;
}): string | undefined => {
  if (input.recordType !== "comment") return undefined;
  if (typeof input.payload !== "object" || input.payload === null || Array.isArray(input.payload)) {
    return undefined;
  }
  const body = (input.payload as Readonly<Record<string, unknown>>).body;
  return typeof body === "string" && body.trim().length > 0 ? body : undefined;
};
