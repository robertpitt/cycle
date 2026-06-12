import { HttpServerResponse } from "effect/unstable/http";

export const resourceResponse = (
  requestId: string,
  status: number,
  data: unknown,
): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.jsonUnsafe(
    {
      data,
      meta: {
        requestId,
      },
    },
    {
      headers: {
        "x-request-id": requestId,
      },
      status,
    },
  );

export const collectionResponse = (
  requestId: string,
  url: URL,
  data: ReadonlyArray<unknown>,
  limit: number,
  nextCursor: string | null | undefined,
): HttpServerResponse.HttpServerResponse => {
  const next = nextCursor ?? null;

  return HttpServerResponse.jsonUnsafe(
    {
      data,
      links: {
        next: next === null ? null : nextUrl(url, next),
        self: `${url.pathname}${url.search}`,
      },
      meta: {
        requestId,
        totalCount: null,
      },
      page: {
        hasMore: next !== null,
        limit,
        nextCursor: next,
      },
    },
    {
      headers: {
        "x-request-id": requestId,
      },
      status: 200,
    },
  );
};

export const errorResponseFromUseCaseFailure = (failure: {
  readonly _tag: string;
  readonly code?: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly message: string;
  readonly requestId: string;
  readonly retryable: boolean;
}): HttpServerResponse.HttpServerResponse =>
  errorResponse(
    failure.requestId,
    statusForFailure(failure._tag),
    failure.code ?? failure._tag,
    failure.message,
    failure.retryable,
    failure.details,
  );

export const errorResponse = (
  requestId: string,
  status: number,
  code: string,
  message: string,
  retryable = status === 503 || status === 504,
  details: Readonly<Record<string, unknown>> = {},
): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.jsonUnsafe(
    {
      error: {
        code,
        details,
        message,
        requestId,
        retryable,
      },
    },
    {
      headers: {
        "x-request-id": requestId,
      },
      status,
    },
  );

export const unauthorizedResponse = (requestId: string): HttpServerResponse.HttpServerResponse =>
  errorResponse(requestId, 401, "UNAUTHORIZED", "Missing or invalid API credentials.");

const statusForFailure = (tag: string): number => {
  switch (tag) {
    case "AuthorizationFailure":
      return 403;
    case "ConflictFailure":
    case "StaleCursorFailure":
      return 409;
    case "InvalidInputFailure":
      return 400;
    case "NotFoundFailure":
    case "RepositoryNotOpenFailure":
      return 404;
    case "PolicyViolationFailure":
      return 422;
    case "RepositoryUnavailableFailure":
      return 503;
    case "TimeoutFailure":
      return 504;
    default:
      return 500;
  }
};

const nextUrl = (url: URL, cursor: string): string => {
  const copy = new URL(url.toString());
  copy.searchParams.set("page[cursor]", cursor);

  return `${copy.pathname}${copy.search}`;
};
