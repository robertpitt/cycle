import { useCaseFromAlias, type UseCaseMeta, type UseCaseRunnerShape } from "@cycle/usecases";
import { Effect } from "effect";
import {
  type TicketRpcMethod,
  type TicketRpcError,
  useCaseFailureToRpcError,
} from "../protocol/index.ts";

export const invokeTicketRpc = (
  runner: UseCaseRunnerShape,
  method: TicketRpcMethod,
  payload: unknown,
  meta: UseCaseMeta = {},
): Effect.Effect<unknown, TicketRpcError> =>
  Effect.gen(function* () {
    const useCase = yield* useCaseFromAlias(method, payload, {
      ...meta,
      source: meta.source ?? "rpc",
    }).pipe(Effect.mapError(useCaseFailureToRpcError));
    const result = yield* runner.run(useCase).pipe(Effect.mapError(useCaseFailureToRpcError));

    return result;
  });
