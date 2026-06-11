import { UseCaseRunner, type UseCaseRunnerShape } from "@cycle/usecases";
import { Cause, Context, Effect, Layer, Result, Schema } from "effect";
import {
  invalidRpcRequest,
  invalidRpcResponse,
  interruptedRpcExecution,
  TicketRpcRequest,
  TicketRpcSuccessSchemas,
  type TicketRpcError,
  type TicketRpcResponse,
} from "../protocol/index.ts";
import { invokeTicketRpc } from "./TicketRpcHandlers.ts";

export type TicketRpcServiceShape = {
  readonly handle: (request: unknown) => Effect.Effect<TicketRpcResponse, never>;
};

export class TicketRpcService extends Context.Service<TicketRpcService, TicketRpcServiceShape>()(
  "@cycle/rpc/TicketRpcService",
) {}

export const makeTicketRpcService = (runner: UseCaseRunnerShape): TicketRpcServiceShape => ({
  handle: (request) =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(TicketRpcRequest)(request).pipe(
        Effect.mapError((error) =>
          invalidRpcRequest("Invalid RPC request envelope.", {
            parseError: String(error),
          }),
        ),
        Effect.result,
      );

      if (Result.isFailure(decoded)) {
        return rpcFailureResponse("unknown", decoded.failure);
      }

      const rpcRequest = decoded.success;
      const result = yield* invokeTicketRpc(runner, rpcRequest.method, rpcRequest.payload, {
        requestId: rpcRequest.id,
        source: "rpc",
      }).pipe(Effect.result);

      if (Result.isFailure(result)) {
        return rpcFailureResponse(rpcRequest.id, result.failure);
      }

      const value = yield* Schema.decodeUnknownEffect(TicketRpcSuccessSchemas[rpcRequest.method])(
        result.success,
      ).pipe(
        Effect.mapError((error) =>
          invalidRpcResponse(`Invalid RPC success value for ${rpcRequest.method}.`, {
            parseError: String(error),
          }),
        ),
        Effect.result,
      );

      if (Result.isFailure(value)) {
        return rpcFailureResponse(rpcRequest.id, value.failure);
      }

      return rpcSuccessResponse(rpcRequest.id, value.success);
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.succeed(
          rpcFailureResponse(
            requestIdFromUnknown(request),
            interruptedRpcExecution("RPC execution was interrupted.", {
              cause: Cause.pretty(cause),
            }),
          ),
        ),
      ),
    ),
});

const rpcFailureResponse = (id: string, error: TicketRpcError): TicketRpcResponse => ({
  error,
  id,
  ok: false,
});

const rpcSuccessResponse = (id: string, value: unknown): TicketRpcResponse => ({
  id,
  ok: true,
  value,
});

const requestIdFromUnknown = (request: unknown): string =>
  typeof request === "object" &&
  request !== null &&
  "id" in request &&
  typeof request.id === "string"
    ? request.id
    : "unknown";

export const TicketRpcLive = Layer.effect(
  TicketRpcService,
  Effect.gen(function* () {
    const runner = yield* UseCaseRunner;

    return makeTicketRpcService(runner);
  }),
);
