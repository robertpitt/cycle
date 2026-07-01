import { ContractSchemas } from "@cycle/contracts";
import { UserGet, UserList, UserUpsert } from "@cycle/usecases";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import {
  decodeHttpValue,
  errorResponse,
  meta,
  objectPayload,
  pagedUseCaseResponse,
  requestIdFromHeaders,
  resourceResponse,
  runUseCase,
  scoped,
  stringField,
  useCaseInvocation,
  urlFromRequest,
  userQueryFrom,
} from "../shared.ts";

export const withUserHandlers = (handlers: any) =>
  handlers
    .handle("listUsers", ({ params, request }: any) =>
      pagedUseCaseResponse(request, (requestId) =>
        useCaseInvocation(
          UserList,
          scoped(params.repositoryId, userQueryFrom(urlFromRequest(request).searchParams)),
          meta(requestId),
        ),
      ),
    )
    .handle("getUser", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const result = yield* runUseCase(
          UserGet,
          scoped(params.repositoryId, params.userId),
          meta(requestId),
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
        const body = objectPayload(payload);
        const input = yield* decodeHttpValue(
          ContractSchemas.UpsertUserInput,
          {
            ...body,
            email: stringField(body, "email", params.userId),
          },
          requestId,
          {
            code: "INVALID_USER_PAYLOAD",
            message: "Invalid user payload.",
          },
        );
        if (HttpServerResponse.isHttpServerResponse(input)) return input;
        const result = yield* runUseCase(
          UserUpsert,
          scoped(params.repositoryId, input),
          meta(requestId),
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;

        return resourceResponse(requestId, 200, result);
      }),
    );
