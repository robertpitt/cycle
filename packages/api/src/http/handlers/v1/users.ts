import { UserGet, UserList, UserUpsert } from "@cycle/contracts";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import {
  errorResponse,
  meta,
  pagedUseCaseResponse,
  requestIdFromHeaders,
  resourceResponse,
  runUseCase,
  scoped,
  stringField,
  urlFromRequest,
  userQueryFrom,
} from "../shared.ts";

export const withUserHandlers = (handlers: any) =>
  handlers
    .handle("listUsers", ({ params, request }: any) =>
      pagedUseCaseResponse(request, (requestId) =>
        UserList(
          scoped(params.repositoryId, userQueryFrom(urlFromRequest(request).searchParams)),
          meta(requestId),
        ),
      ),
    )
    .handle("getUser", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          UserGet(scoped(params.repositoryId, params.userId), meta(requestId)),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return result === null
          ? errorResponse(requestId, 404, "NOT_FOUND", "User not found.")
          : resourceResponse(requestId, 200, result);
      }),
    )
    .handle("upsertUser", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          UserUpsert(
            scoped(params.repositoryId, {
              ...payload,
              email: stringField(payload, "email", params.userId),
            } as any),
            meta(requestId),
          ),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    );
