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

    if (method === "ticket.record.listForIssue") {
      return recordPageEntries(result);
    }

    return result;
  });

const recordPageEntries = (value: unknown): ReadonlyArray<unknown> => {
  if (typeof value !== "object" || value === null) return [];
  const entries = (value as { readonly entries?: unknown }).entries;
  return Array.isArray(entries) ? entries : [];
};
