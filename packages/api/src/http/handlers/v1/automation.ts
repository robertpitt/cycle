import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import { AutomationEvaluatePayload } from "../../schemas/AutomationEvaluationResourceEnvelope.ts";
import { CycleRequestContext } from "../../middleware/CycleRequestContextMiddleware.ts";
import { resourceResponse } from "../responses.ts";
import { decodeHttpValue, runAutomationUseCase } from "../usecases.ts";
import type { V1Request } from "./types.ts";

export const evaluateAutomation = ({ params, payload }: V1Request<"evaluateAutomation">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
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
  });
