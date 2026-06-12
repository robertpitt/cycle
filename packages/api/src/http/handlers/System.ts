import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { CycleHttpApi } from "../CycleHttpApi.ts";
import { CycleApiRuntime } from "../runtime/CycleApiRuntime.ts";
import { requestIdFromHeaders, resourceResponse } from "./shared.ts";

export const SystemApiHandlers = HttpApiBuilder.group(
  CycleHttpApi,
  "system",
  Effect.fn(function* (handlers) {
    const runtime = yield* CycleApiRuntime;

    return handlers.handle("health", ({ request }) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);

        return resourceResponse(requestId, 200, {
          apiVersion: runtime.apiVersion,
          startedAt: runtime.startedAt,
          status: "ok",
        });
      }),
    );
  }),
);
