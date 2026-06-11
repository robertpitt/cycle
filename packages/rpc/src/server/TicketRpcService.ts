import { UseCaseRunner, type UseCaseRunnerShape } from "@cycle/usecases";
import { Context, Effect, Layer, Result, Schema } from "effect";
import { invalidRpcRequest, TicketRpcRequest, type TicketRpcResponse } from "../protocol/index.ts";
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
        return {
          error: decoded.failure,
          id: "unknown",
          ok: false,
        };
      }

      const rpcRequest = decoded.success;
      const result = yield* invokeTicketRpc(runner, rpcRequest.method, rpcRequest.payload, {
        requestId: rpcRequest.id,
        source: "rpc",
      }).pipe(Effect.result);

      if (Result.isFailure(result)) {
        return {
          error: result.failure,
          id: rpcRequest.id,
          ok: false,
        };
      }

      return {
        id: rpcRequest.id,
        ok: true,
        value: result.success,
      };
    }),
});

export const TicketRpcLive = Layer.effect(
  TicketRpcService,
  Effect.gen(function* () {
    const runner = yield* UseCaseRunner;

    return makeTicketRpcService(runner);
  }),
);
