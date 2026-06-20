import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import { AutomationEvaluatePayload } from "../../schemas.ts";
import {
  decodeHttpValue,
  requestIdFromHeaders,
  resourceResponse,
  runAutomationUseCase,
} from "../shared.ts";

export const withAutomationHandlers = (handlers: any) =>
  handlers.handle("evaluateAutomation", ({ params, payload, request }: any) =>
    Effect.gen(function* () {
      const requestId = yield* requestIdFromHeaders(request.headers);
      const input = yield* decodeHttpValue(
        AutomationEvaluatePayload,
        payload === undefined ? {} : payload,
        requestId,
        {
          code: "INVALID_AUTOMATION_PAYLOAD",
          message: "Invalid automation evaluation payload.",
        },
      );
      if (HttpServerResponse.isHttpServerResponse(input)) return input;
      const result = yield* runAutomationUseCase(params.repositoryId, input, requestId);
      if (HttpServerResponse.isHttpServerResponse(result)) return result;

      return resourceResponse(requestId, 200, result);
    }),
  );
