import { ContractSchemas, type InboxPage, type InboxQuery } from "@cycle/contracts";
import {
  InboxArchive,
  InboxList,
  InboxMarkRead,
  InboxMarkUnread,
  InboxSummaryGet,
} from "@cycle/usecases";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import { CycleRequestContext } from "../../middleware/CycleRequestContextMiddleware.ts";
import { inboxQueryFrom, pageLimitFrom, urlFromRequest } from "../query.ts";
import { collectionResponse, resourceResponse } from "../responses.ts";
import { decodeHttpValue, meta, runUseCase } from "../usecases.ts";
import type { V1Request } from "./types.ts";

export const listInbox = ({ request }: V1Request<"listInbox">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const url = urlFromRequest(request);
    const input = yield* decodeInboxQuery(url.searchParams, requestId);
    if (HttpServerResponse.isHttpServerResponse(input)) return input;
    const result = yield* runUseCase(InboxList, input, meta(requestId));
    if (HttpServerResponse.isHttpServerResponse(result)) return result;
    const page = result as InboxPage;

    return collectionResponse(
      requestId,
      url,
      page.entries,
      pageLimitFrom(url.searchParams),
      page.nextCursor,
      {
        meta: {
          activeSnapshotIds: page.activeSnapshotIds,
        },
      },
    );
  });

export const inboxSummary = ({ request }: V1Request<"inboxSummary">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const url = urlFromRequest(request);
    const input = yield* decodeInboxQuery(url.searchParams, requestId);
    if (HttpServerResponse.isHttpServerResponse(input)) return input;
    const result = yield* runUseCase(InboxSummaryGet, input, meta(requestId));
    if (HttpServerResponse.isHttpServerResponse(result)) return result;

    return resourceResponse(requestId, 200, result);
  });

export const markInboxRead = ({ payload }: V1Request<"markInboxRead">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const result = yield* runUseCase(InboxMarkRead, payload, meta(requestId));
    if (HttpServerResponse.isHttpServerResponse(result)) return result;

    return resourceResponse(requestId, 200, result);
  });

export const markInboxUnread = ({ payload }: V1Request<"markInboxUnread">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const result = yield* runUseCase(InboxMarkUnread, payload, meta(requestId));
    if (HttpServerResponse.isHttpServerResponse(result)) return result;

    return resourceResponse(requestId, 200, result);
  });

export const archiveInbox = ({ payload }: V1Request<"archiveInbox">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const result = yield* runUseCase(InboxArchive, payload, meta(requestId));
    if (HttpServerResponse.isHttpServerResponse(result)) return result;

    return resourceResponse(requestId, 200, result);
  });

const decodeInboxQuery = (
  params: URLSearchParams,
  requestId: string,
): Effect.Effect<InboxQuery | HttpServerResponse.HttpServerResponse> =>
  decodeHttpValue(ContractSchemas.InboxQuery, inboxQueryFrom(params), requestId, {
    code: "INVALID_INBOX_QUERY",
    message: "Invalid inbox query.",
  });
