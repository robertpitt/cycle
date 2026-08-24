import * as ContractSchemas from "@cycle/contracts/schemas";
import { CommentAdd, CommentList } from "@cycle/usecases";
import type { CommentDocument, LinkedRecord } from "@cycle/contracts/schemas";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import { CycleRequestContext } from "../../middleware/CycleRequestContextMiddleware.ts";
import { asPage, pageLimitFrom, urlFromRequest } from "../query.ts";
import { collectionResponse, resourceResponse } from "../responses.ts";
import { decodeHttpValue, meta, runUseCase, scoped } from "../usecases.ts";
import { idFromResult } from "../../../agents/services/AgentChatUtilities.ts";
import { handleSuccessfulCommentMentions } from "./commentMentions.ts";
import type { V1Request } from "./types.ts";

export const listIssueComments = ({ params, request }: V1Request<"listIssueComments">) =>
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
        target: ticketTarget(params.repositoryId, params.issueId),
      },
      requestId,
      { code: "INVALID_COMMENT_QUERY", message: "Invalid issue comment query." },
    );
    if (HttpServerResponse.isHttpServerResponse(input)) return input;
    const pageValue = yield* runUseCase(
      CommentList,
      scoped(params.repositoryId, input),
      meta(requestId),
    );
    if (HttpServerResponse.isHttpServerResponse(pageValue)) return pageValue;
    const result = asPage(pageValue);

    return collectionResponse(
      requestId,
      url,
      result.entries.map((comment) => legacyTicketComment(comment as CommentDocument)),
      pageLimitFrom(url.searchParams),
      result.nextCursor,
    );
  });

export const addIssueComment = ({ params, payload, request }: V1Request<"addIssueComment">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const input = yield* decodeHttpValue(
      ContractSchemas.CommentAddInput,
      {
        body: payload.body,
        target: ticketTarget(params.repositoryId, params.issueId),
      },
      requestId,
      { code: "INVALID_COMMENT_PAYLOAD", message: "Invalid issue comment payload." },
    );
    if (HttpServerResponse.isHttpServerResponse(input)) return input;
    const result = yield* runUseCase(
      CommentAdd,
      scoped(params.repositoryId, input),
      meta(requestId, request.headers),
    );
    if (HttpServerResponse.isHttpServerResponse(result)) return result;
    const legacy = legacyTicketComment(result as CommentDocument);
    yield* handleSuccessfulCommentMentions({
      body: input.body,
      comment: legacy,
      commentId: idFromResult(legacy, requestId),
      repositoryId: params.repositoryId,
      request,
      requestId,
      ticketId: params.issueId,
    });

    return resourceResponse(requestId, 201, legacy);
  });

const ticketTarget = (repositoryId: string, ticketId: string) => ({
  repositoryId,
  resourceId: ticketId,
  resourceKind: "ticket" as const,
});

const legacyTicketComment = (comment: CommentDocument): LinkedRecord => ({
  createdAt: comment.createdAt,
  createdBy: comment.createdBy,
  createdDate: comment.createdAt.slice(0, 10),
  id: comment.id,
  issueId: comment.target.resourceId,
  payload: { body: comment.body },
  recordType: "comment",
  schemaVersion: 1,
});
