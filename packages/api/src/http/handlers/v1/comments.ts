import { ContractSchemas, contractFor } from "@cycle/contracts";
import { CommentAdd, RecordListForIssue } from "@cycle/usecases";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import {
  asPage,
  collectionResponse,
  decodeHttpValue,
  errorResponse,
  meta,
  pageLimitFrom,
  requestIdFromHeaders,
  resourceResponse,
  runUseCase,
  scoped,
  urlFromRequest,
} from "../shared.ts";
import { handleSuccessfulComment, idFromResult } from "./agentWorkEvents.ts";

export const withCommentHandlers = (handlers: any) =>
  handlers
    .handle("listIssueComments", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const url = urlFromRequest(request);
        const input = yield* decodeHttpValue(
          ContractSchemas.RecordsForIssueInput,
          {
            issueId: params.issueId,
            query: {
              cursor: url.searchParams.get("page[cursor]") ?? undefined,
              limit: pageLimitFrom(url.searchParams),
              recordType: "comment",
            },
          },
          requestId,
          { code: "INVALID_COMMENT_QUERY", message: "Invalid issue comment query." },
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
    .handle("addIssueComment", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const input = yield* decodeHttpValue(
          contractFor("CommentAdd").inputSchema,
          scoped(params.repositoryId, {
            body: payload.body,
            issueId: params.issueId,
          }),
          requestId,
          { code: "INVALID_COMMENT_PAYLOAD", message: "Invalid issue comment payload." },
        );
        if (HttpServerResponse.isHttpServerResponse(input)) return input;
        const result = yield* runUseCase(CommentAdd, input, meta(requestId));
        if (HttpServerResponse.isHttpServerResponse(result)) return result;
        yield* handleSuccessfulComment({
          body: input.input.body,
          comment: result,
          commentId: idFromResult(result, requestId),
          origin: urlFromRequest(request).origin,
          repositoryId: params.repositoryId,
          requestId,
          ticketId: params.issueId,
        });

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
