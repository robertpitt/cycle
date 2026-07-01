import {
  ContractSchemas,
  type InboxQuery,
} from "@cycle/contracts";
import {
  InboxArchive,
  InboxList,
  InboxMarkRead,
  InboxMarkUnread,
  InboxSummaryGet,
} from "@cycle/usecases";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import {
  decodeHttpValue,
  inboxQueryFrom,
  meta,
  requestIdFromHeaders,
  resourceResponse,
  runUseCase,
  urlFromRequest,
} from "../shared.ts";

export const withInboxHandlers = (handlers: any) =>
  handlers
    .handle("listInbox", ({ request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const url = urlFromRequest(request);
        const input = yield* decodeInboxQuery(url.searchParams, requestId);
        if (HttpServerResponse.isHttpServerResponse(input)) return input;
        const result = yield* runUseCase(InboxList, input, meta(requestId));
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    )
    .handle("inboxSummary", ({ request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const url = urlFromRequest(request);
        const input = yield* decodeInboxQuery(url.searchParams, requestId);
        if (HttpServerResponse.isHttpServerResponse(input)) return input;
        const result = yield* runUseCase(InboxSummaryGet, input, meta(requestId));
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    )
    .handle("markInboxRead", ({ payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(InboxMarkRead, payload, meta(requestId));
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    )
    .handle("markInboxUnread", ({ payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(InboxMarkUnread, payload, meta(requestId));
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    )
    .handle("archiveInbox", ({ payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(InboxArchive, payload, meta(requestId));
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    );

const decodeInboxQuery = (
  params: URLSearchParams,
  requestId: string,
): Effect.Effect<InboxQuery | HttpServerResponse.HttpServerResponse> =>
  decodeHttpValue(ContractSchemas.InboxQuery, inboxQueryFrom(params), requestId, {
    code: "INVALID_INBOX_QUERY",
    message: "Invalid inbox query.",
  });
