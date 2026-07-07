import * as ContractSchemas from "@cycle/contracts/schemas";
import { UserGet, UserList, UserUpsert } from "@cycle/usecases";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import { CycleRequestContext } from "../../middleware/CycleRequestContextMiddleware.ts";
import { stringField, urlFromRequest, userQueryFrom } from "../query.ts";
import { errorResponse, resourceResponse } from "../responses.ts";
import {
  decodeHttpValue,
  meta,
  objectPayload,
  pagedUseCaseResponse,
  runUseCase,
  scoped,
  useCaseInvocation,
} from "../usecases.ts";
import type { V1Request } from "./types.ts";

export const listUsers = ({ params, request }: V1Request<"listUsers">) =>
  pagedUseCaseResponse(request, (requestId) =>
    useCaseInvocation(
      UserList,
      scoped(params.repositoryId, userQueryFrom(urlFromRequest(request).searchParams)),
      meta(requestId),
    ),
  );

export const getUser = ({ params }: V1Request<"getUser">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const result = yield* runUseCase(
      UserGet,
      scoped(params.repositoryId, params.userId),
      meta(requestId),
    );
    if (HttpServerResponse.isHttpServerResponse(result)) return result;

    return result === null
      ? errorResponse(requestId, 404, "NOT_FOUND", "User not found.")
      : resourceResponse(requestId, 200, result);
  });

export const upsertUser = ({ params, payload }: V1Request<"upsertUser">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
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
  });
