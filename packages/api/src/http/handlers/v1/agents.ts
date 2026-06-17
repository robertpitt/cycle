import { Effect, Result } from "effect";
import { CycleApiRuntime } from "../../runtime/CycleApiRuntime.ts";
import { errorResponse, requestIdFromHeaders, resourceResponse } from "../shared.ts";

export const withAgentHandlers = (handlers: any) =>
  handlers.handle("listAgentProviders", ({ request }: any) =>
    Effect.gen(function* () {
      const runtime = yield* CycleApiRuntime;
      const requestId = yield* requestIdFromHeaders(request.headers);
      const result = yield* Effect.result(
        Effect.tryPromise({
          catch: (cause) => cause,
          try: () => runtime.agentProviderProfiles(),
        }),
      );

      if (Result.isFailure(result)) {
        return errorResponse(
          requestId,
          503,
          "AGENT_RUNTIME_UNAVAILABLE",
          "Agent provider status is unavailable.",
          true,
          {
            cause:
              result.failure instanceof Error ? result.failure.message : String(result.failure),
          },
        );
      }

      return resourceResponse(requestId, 200, {
        providers: result.success,
      });
    }),
  );
