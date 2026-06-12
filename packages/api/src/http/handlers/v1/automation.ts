import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import { requestIdFromHeaders, resourceResponse, runAutomationUseCase } from "../shared.ts";

export const withAutomationHandlers = (handlers: any) =>
  handlers.handle("evaluateAutomation", ({ params, payload, request }: any) =>
    Effect.gen(function* () {
      const requestId = yield* requestIdFromHeaders(request.headers);
      const result = yield* runAutomationUseCase(params.repositoryId, payload, requestId);
      if (HttpServerResponse.isHttpServerResponse(result)) return result;

      return resourceResponse(requestId, 200, result);
    }),
  );
