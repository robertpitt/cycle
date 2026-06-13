import {
  InboxArchive,
  InboxList,
  InboxMarkRead,
  InboxMarkUnread,
  InboxSummaryGet,
} from "@cycle/contracts";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import {
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
        const result = yield* runUseCase(
          InboxList(inboxQueryFrom(url.searchParams) as any, meta(requestId)),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    )
    .handle("inboxSummary", ({ request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const url = urlFromRequest(request);
        const result = yield* runUseCase(
          InboxSummaryGet(inboxQueryFrom(url.searchParams) as any, meta(requestId)),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    )
    .handle("markInboxRead", ({ payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(InboxMarkRead(payload, meta(requestId)));
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    )
    .handle("markInboxUnread", ({ payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(InboxMarkUnread(payload, meta(requestId)));
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    )
    .handle("archiveInbox", ({ payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(InboxArchive(payload, meta(requestId)));
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    );
