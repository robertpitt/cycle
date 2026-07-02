import { Effect, Schema } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import { CycleApiRuntime, type LocalSettingsProviderShape } from "../../runtime/CycleApiRuntime.ts";
import {
  AppConfigOutput,
  AgentProviderPreferencePayload,
  CompleteOnboardingPayload,
  InterfaceDensityPayload,
  ProfileOutput,
  ProfileUpdatePayload,
  RepositoryPreferencesPayload,
  RepositoryRecordNullableOutput,
  ThemePreferencePayload,
} from "../../schemas.ts";
import { decodeHttpValue, requestIdFromHeaders, resourceResponse } from "../shared.ts";
import { errorResponse } from "../responses.ts";

export const withSettingsHandlers = (handlers: any) =>
  handlers
    .handle("getAppConfig", ({ request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);

        return yield* runLocalSettings(requestId, "read", AppConfigOutput, (settings) =>
          settings.read(),
        );
      }),
    )
    .handle("updateProfile", ({ payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const input = yield* decodeHttpValue(
          ProfileUpdatePayload,
          payload === undefined ? {} : payload,
          requestId,
          {
            code: "INVALID_LOCAL_SETTINGS_INPUT",
            message: "Invalid profile update payload.",
          },
        );
        if (HttpServerResponse.isHttpServerResponse(input)) return input;

        return yield* runLocalSettings(requestId, "updateProfile", ProfileOutput, (settings) =>
          settings.updateProfile?.(input),
        );
      }),
    )
    .handle("completeOnboarding", ({ payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const input = yield* decodeHttpValue(CompleteOnboardingPayload, payload, requestId, {
          code: "INVALID_LOCAL_SETTINGS_INPUT",
          message: "Invalid onboarding payload.",
        });
        if (HttpServerResponse.isHttpServerResponse(input)) return input;

        return yield* runLocalSettings(
          requestId,
          "completeOnboarding",
          AppConfigOutput,
          (settings) => settings.completeOnboarding?.(input),
        );
      }),
    )
    .handle("setThemePreference", ({ payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const input = yield* decodeHttpValue(ThemePreferencePayload, payload, requestId, {
          code: "INVALID_LOCAL_SETTINGS_INPUT",
          message: "Invalid theme preference payload.",
        });
        if (HttpServerResponse.isHttpServerResponse(input)) return input;

        return yield* runLocalSettings(
          requestId,
          "setThemePreference",
          AppConfigOutput,
          (settings) => settings.setThemePreference?.(input.preference),
        );
      }),
    )
    .handle("setInterfaceDensity", ({ payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const input = yield* decodeHttpValue(InterfaceDensityPayload, payload, requestId, {
          code: "INVALID_LOCAL_SETTINGS_INPUT",
          message: "Invalid interface density payload.",
        });
        if (HttpServerResponse.isHttpServerResponse(input)) return input;

        return yield* runLocalSettings(
          requestId,
          "setInterfaceDensity",
          AppConfigOutput,
          (settings) => settings.setInterfaceDensity?.(input.density),
        );
      }),
    )
    .handle("updateAgentProviderPreference", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const input = yield* decodeHttpValue(AgentProviderPreferencePayload, payload, requestId, {
          code: "INVALID_LOCAL_SETTINGS_INPUT",
          message: "Invalid agent provider preference payload.",
        });
        if (HttpServerResponse.isHttpServerResponse(input)) return input;

        return yield* runLocalSettings(
          requestId,
          "updateAgentProviderPreference",
          AppConfigOutput,
          (settings) =>
            settings.updateAgentProviderPreference?.({
              preference: input.preference,
              providerId: params.providerId,
            }),
        );
      }),
    )
    .handle("updateRepositoryPreferences", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const payloadInput = yield* decodeHttpValue(
          RepositoryPreferencesPayload,
          payload,
          requestId,
          {
            code: "INVALID_LOCAL_SETTINGS_INPUT",
            message: "Invalid repository preferences payload.",
          },
        );
        if (HttpServerResponse.isHttpServerResponse(payloadInput)) return payloadInput;

        const input = {
          id: params.repositoryId,
          preferences: payloadInput.preferences,
        };

        return yield* runLocalSettings(
          requestId,
          "updateRepositoryPreferences",
          RepositoryRecordNullableOutput,
          (settings) => settings.updateRepositoryPreferences?.(input),
        );
      }),
    )
    .handle("removeRepository", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);

        return yield* runLocalSettings(requestId, "removeRepository", AppConfigOutput, (settings) =>
          settings.removeRepository?.(params.repositoryId),
        );
      }),
    );

const runLocalSettings = <S extends Schema.Top>(
  requestId: string,
  operation: keyof LocalSettingsProviderShape,
  outputSchema: S,
  run: (settings: LocalSettingsProviderShape) => Promise<unknown> | undefined,
): Effect.Effect<HttpServerResponse.HttpServerResponse, never, CycleApiRuntime> =>
  Effect.gen(function* () {
    const runtime = yield* CycleApiRuntime;
    const settings = runtime.localSettings;

    if (settings === undefined) {
      return errorResponse(
        requestId,
        501,
        "LOCAL_SETTINGS_UNAVAILABLE",
        "Local settings require a host-provided settings service.",
        false,
      );
    }

    const output = yield* Effect.tryPromise({
      try: async () => {
        const promise = run(settings);

        if (promise === undefined) {
          return errorResponse(
            requestId,
            501,
            "LOCAL_SETTINGS_OPERATION_UNAVAILABLE",
            `Local settings operation is unavailable: ${String(operation)}.`,
            false,
          );
        }

        return await promise;
      },
      catch: (error) => localSettingsFailedResponse(requestId, error),
    }).pipe(Effect.catch((response) => Effect.succeed(response)));

    if (HttpServerResponse.isHttpServerResponse(output)) return output;
    const decoded = yield* decodeHttpValue(outputSchema, output, requestId, {
      code: "INVALID_LOCAL_SETTINGS_OUTPUT",
      message: `Local settings operation returned data outside the API contract: ${String(
        operation,
      )}.`,
      status: 500,
    });
    if (HttpServerResponse.isHttpServerResponse(decoded)) return decoded;

    return resourceResponse(requestId, 200, decoded);
  });

const localSettingsFailedResponse = (
  requestId: string,
  error: unknown,
): HttpServerResponse.HttpServerResponse =>
  errorResponse(
    requestId,
    500,
    "LOCAL_SETTINGS_OPERATION_FAILED",
    error instanceof Error ? error.message : "Local settings operation failed.",
    false,
  );
