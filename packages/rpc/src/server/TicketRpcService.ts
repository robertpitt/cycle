import type { TicketDbService } from "@cycle/ticket-db";
import { Context, Effect, Layer, Result, Schema } from "effect";
import { invalidRpcRequest, TicketRpcRequest, type TicketRpcResponse } from "../protocol/index.ts";
import { invokeTicketRpc } from "./TicketRpcHandlers.ts";

export type TicketRpcServiceShape = {
  readonly handle: (request: unknown) => Effect.Effect<TicketRpcResponse, never, TicketDbService>;
};

export class TicketRpcService extends Context.Service<TicketRpcService, TicketRpcServiceShape>()(
  "@cycle/rpc/TicketRpcService",
) {}

export const makeTicketRpcService = (): TicketRpcServiceShape => ({
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
      const result = yield* invokeTicketRpc(rpcRequest.method, rpcRequest.payload).pipe(
        Effect.result,
      );

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

export const TicketRpcLive = Layer.succeed(TicketRpcService, makeTicketRpcService());
