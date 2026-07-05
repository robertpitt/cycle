import { ContractSchemas } from "@cycle/contracts";
import { CommentAdd, RecordListForIssue } from "@cycle/usecases";
import { contractFor } from "@cycle/usecases/contracts";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import { CycleRequestContext } from "../../middleware/CycleRequestContextMiddleware.ts";
import { asPage, pageLimitFrom, urlFromRequest } from "../query.ts";
import { collectionResponse, resourceResponse } from "../responses.ts";
import { decodeHttpValue, meta, runUseCase, scoped } from "../usecases.ts";
import { handleSuccessfulCommentMentions, idFromResult } from "./commentMentions.ts";
import type { V1Request } from "./types.ts";

export const listIssueComments = ({ params, request }: V1Request<"listIssueComments">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
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
  });

export const addIssueComment = ({ params, payload, request }: V1Request<"addIssueComment">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
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
    yield* handleSuccessfulCommentMentions({
      body: input.input.body,
      comment: result,
      commentId: idFromResult(result, requestId),
      repositoryId: params.repositoryId,
      request,
      requestId,
      ticketId: params.issueId,
    });

    return resourceResponse(requestId, 201, result);
  });
