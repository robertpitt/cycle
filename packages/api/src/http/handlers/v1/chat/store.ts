import { Effect, Result } from "effect";
import type { HttpServerResponse } from "effect/unstable/http";
import type { AgentChatStoreShape } from "@cycle/agent-chat";
import { CycleApiError } from "../../../../CycleApiError.ts";
import { CycleApiRuntime } from "../../../runtime/CycleApiRuntime.ts";
import { errorResponse } from "../../responses.ts";

type StoreOperation<T> =
  | {
      readonly error: HttpServerResponse.HttpServerResponse;
      readonly value?: never;
    }
  | {
      readonly error?: never;
      readonly value: T;
    };

const chatStoreUnavailable = (requestId: string): HttpServerResponse.HttpServerResponse =>
  errorResponse(
    requestId,
    501,
    "AGENT_CHAT_STORE_UNAVAILABLE",
    "Agent chat persistence is not available in this host.",
    false,
  );

const chatStoreFailure = (
  requestId: string,
  action: string,
  cause: unknown,
): HttpServerResponse.HttpServerResponse =>
  errorResponse(requestId, 500, "AGENT_CHAT_STORE_FAILED", `Could not ${action}.`, false, {
    cause: cause instanceof Error ? cause.message : String(cause),
  });

export const runStoreOperation = <T>(
  requestId: string,
  action: string,
  operation: (store: AgentChatStoreShape) => Promise<T>,
): Effect.Effect<StoreOperation<T>, never, CycleApiRuntime> =>
  Effect.gen(function* () {
    const runtime = yield* CycleApiRuntime;
    const store = runtime.agentChatRuntime?.store;
    if (store === undefined) return { error: chatStoreUnavailable(requestId) };

    const result = yield* Effect.result(
      Effect.tryPromise({
        catch: (cause) =>
          new CycleApiError({
            cause,
            message: cause instanceof Error ? cause.message : `${action} failed`,
            operation: action,
          }),
        try: () => operation(store),
      }),
    );

    if (Result.isFailure(result)) {
      return { error: chatStoreFailure(requestId, action, result.failure) };
    }

    return { value: result.success };
  });
