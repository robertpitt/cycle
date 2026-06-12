import { CommentAdd, RecordListForIssue } from "@cycle/contracts";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import {
  asPage,
  collectionResponse,
  errorResponse,
  meta,
  pageLimitFrom,
  requestIdFromHeaders,
  resourceResponse,
  runUseCase,
  scoped,
  urlFromRequest,
} from "../shared.ts";

export const withCommentHandlers = (handlers: any) =>
  handlers
    .handle("listIssueComments", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const url = urlFromRequest(request);
        const pageValue = yield* runUseCase(
          RecordListForIssue(
            scoped(params.repositoryId, {
              issueId: params.issueId,
              query: {
                cursor: url.searchParams.get("page[cursor]") ?? undefined,
                limit: pageLimitFrom(url.searchParams),
                recordType: "comment",
              },
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
    .handle("addIssueComment", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          CommentAdd(
            scoped(params.repositoryId, {
              body: payload.body,
              issueId: params.issueId,
            }),
            meta(requestId),
          ),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 201, result);
      }),
    )
    .handle("archiveIssueComment", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);

        return errorResponse(
          requestId,
          501,
          "COMMENT_ARCHIVE_UNAVAILABLE",
          `Archiving comment ${params.commentId} is not supported until a canonical comment archive usecase is available.`,
        );
      }),
    );
