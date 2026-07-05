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
} from "../../schemas/AppConfigResourceEnvelope.ts";
import { CycleRequestContext } from "../../middleware/CycleRequestContextMiddleware.ts";
import { resourceResponse } from "../responses.ts";
import { decodeHttpValue } from "../usecases.ts";
import { errorResponse } from "../responses.ts";
import type { V1Request } from "./types.ts";

export const getAppConfig = () =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;

    return yield* runLocalSettings(requestId, "read", AppConfigOutput, (settings) =>
      settings.read(),
    );
  });

export const updateProfile = ({ payload }: V1Request<"updateProfile">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
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
  });

export const completeOnboarding = ({ payload }: V1Request<"completeOnboarding">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const input = yield* decodeHttpValue(CompleteOnboardingPayload, payload, requestId, {
      code: "INVALID_LOCAL_SETTINGS_INPUT",
      message: "Invalid onboarding payload.",
    });
    if (HttpServerResponse.isHttpServerResponse(input)) return input;

    return yield* runLocalSettings(requestId, "completeOnboarding", AppConfigOutput, (settings) =>
      settings.completeOnboarding?.(input),
    );
  });

export const setThemePreference = ({ payload }: V1Request<"setThemePreference">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const input = yield* decodeHttpValue(ThemePreferencePayload, payload, requestId, {
      code: "INVALID_LOCAL_SETTINGS_INPUT",
      message: "Invalid theme preference payload.",
    });
    if (HttpServerResponse.isHttpServerResponse(input)) return input;

    return yield* runLocalSettings(requestId, "setThemePreference", AppConfigOutput, (settings) =>
      settings.setThemePreference?.(input.preference),
    );
  });

export const setInterfaceDensity = ({ payload }: V1Request<"setInterfaceDensity">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const input = yield* decodeHttpValue(InterfaceDensityPayload, payload, requestId, {
      code: "INVALID_LOCAL_SETTINGS_INPUT",
      message: "Invalid interface density payload.",
    });
    if (HttpServerResponse.isHttpServerResponse(input)) return input;

    return yield* runLocalSettings(requestId, "setInterfaceDensity", AppConfigOutput, (settings) =>
      settings.setInterfaceDensity?.(input.density),
    );
  });

export const updateAgentProviderPreference = ({
  params,
  payload,
}: V1Request<"updateAgentProviderPreference">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
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
  });

export const updateRepositoryPreferences = ({
  params,
  payload,
}: V1Request<"updateRepositoryPreferences">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const payloadInput = yield* decodeHttpValue(RepositoryPreferencesPayload, payload, requestId, {
      code: "INVALID_LOCAL_SETTINGS_INPUT",
      message: "Invalid repository preferences payload.",
    });
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
  });

export const removeRepository = ({ params }: V1Request<"removeRepository">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;

    return yield* runLocalSettings(requestId, "removeRepository", AppConfigOutput, (settings) =>
      settings.removeRepository?.(params.repositoryId),
    );
  });

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
