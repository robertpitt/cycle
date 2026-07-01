import { Effect, Result } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import { CycleApiRuntime } from "../../runtime/CycleApiRuntime.ts";
import { AgentProvidersOutput } from "../../schemas.ts";
import {
  ApiHandlerError,
  decodeHttpValue,
  errorResponse,
  requestIdFromHeaders,
  resourceResponse,
} from "../shared.ts";

export const withAgentHandlers = (handlers: any) =>
  handlers.handle("listAgentProviders", ({ request }: any) =>
    Effect.gen(function* () {
      const runtime = yield* CycleApiRuntime;
      const requestId = yield* requestIdFromHeaders(request.headers);
      const result = yield* Effect.result(
        Effect.tryPromise({
          catch: (cause) =>
            new ApiHandlerError({
              cause,
              message: cause instanceof Error ? cause.message : "list agent providers failed",
              operation: "list agent providers",
            }),
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

      const output = yield* decodeHttpValue(
        AgentProvidersOutput,
        {
          providers: result.success.map((provider) => ({
            capabilities: {
              provider: provider.capabilities.provider,
              sessionPersistence: provider.capabilities.sessionPersistence,
              streaming: provider.capabilities.streaming,
              structuredOutput: provider.capabilities.structuredOutput,
              supportedJobTypes: provider.capabilities.supportedJobTypes,
              supports: provider.capabilities.supports,
              workspace: provider.capabilities.workspace,
            },
            checkedAt: provider.checkedAt,
            configuration: provider.configuration,
            displayName: provider.displayName,
            executableName: provider.executableName,
            ...(provider.executablePath === undefined
              ? {}
              : { executablePath: provider.executablePath }),
            ...(provider.message === undefined ? {} : { message: provider.message }),
            models: provider.models,
            provider: provider.provider,
            status: provider.status,
          })),
        },
        requestId,
        {
          code: "INVALID_AGENT_PROVIDER_OUTPUT",
          message: "Agent provider status did not match the API contract.",
          status: 500,
        },
      );
      if (HttpServerResponse.isHttpServerResponse(output)) return output;

      return resourceResponse(requestId, 200, output);
    }),
  );
