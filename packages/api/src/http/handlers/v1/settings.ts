import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import {
  CycleApiRuntime,
  type LocalSettingsOnboardingInput,
  type LocalSettingsProfileUpdateInput,
  type LocalSettingsRepositoryPreferencesInput,
  type LocalSettingsProviderShape,
} from "../../runtime/CycleApiRuntime.ts";
import { requestIdFromHeaders, resourceResponse } from "../shared.ts";
import { errorResponse } from "../responses.ts";

export const withSettingsHandlers = (handlers: any) =>
  handlers
    .handle("getAppConfig", ({ request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);

        return yield* runLocalSettings(requestId, "read", (settings) => settings.read());
      }),
    )
    .handle("updateProfile", ({ payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const input = profileUpdateInput(payload, requestId);
        if (HttpServerResponse.isHttpServerResponse(input)) return input;

        return yield* runLocalSettings(requestId, "updateProfile", (settings) =>
          settings.updateProfile?.(input),
        );
      }),
    )
    .handle("completeOnboarding", ({ payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const input = onboardingInput(payload, requestId);
        if (HttpServerResponse.isHttpServerResponse(input)) return input;

        return yield* runLocalSettings(requestId, "completeOnboarding", (settings) =>
          settings.completeOnboarding?.(input),
        );
      }),
    )
    .handle("setThemePreference", ({ payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const preference = requiredString(payload, "preference");
        if (preference === undefined) {
          return invalidSettingsInput(
            requestId,
            "preference",
            "Theme preference must be a string.",
          );
        }

        return yield* runLocalSettings(requestId, "setThemePreference", (settings) =>
          settings.setThemePreference?.(preference),
        );
      }),
    )
    .handle("updateRepositoryPreferences", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const preferences = preferencesPayload(payload);
        if (preferences === undefined) {
          return invalidSettingsInput(
            requestId,
            "preferences",
            "Repository preferences must be an object.",
          );
        }

        const input: LocalSettingsRepositoryPreferencesInput = {
          id: params.repositoryId,
          preferences,
        };

        return yield* runLocalSettings(requestId, "updateRepositoryPreferences", (settings) =>
          settings.updateRepositoryPreferences?.(input),
        );
      }),
    );

const runLocalSettings = (
  requestId: string,
  operation: keyof LocalSettingsProviderShape,
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

    let promise: Promise<unknown> | undefined;
    try {
      promise = run(settings);
    } catch (error) {
      return localSettingsFailedResponse(requestId, error);
    }

    if (promise === undefined) {
      return errorResponse(
        requestId,
        501,
        "LOCAL_SETTINGS_OPERATION_UNAVAILABLE",
        `Local settings operation is unavailable: ${String(operation)}.`,
        false,
      );
    }

    return yield* Effect.promise(async () => {
      try {
        return resourceResponse(requestId, 200, await promise);
      } catch (error) {
        return localSettingsFailedResponse(requestId, error);
      }
    });
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

const profileUpdateInput = (
  payload: unknown,
  requestId: string,
): LocalSettingsProfileUpdateInput | HttpServerResponse.HttpServerResponse => {
  if (!isRecord(payload)) {
    return invalidSettingsInput(requestId, "body", "Profile update must be an object.");
  }

  const displayName = optionalString(payload.displayName);
  const email = optionalString(payload.email);

  return {
    ...(displayName === undefined ? {} : { displayName }),
    ...(email === undefined ? {} : { email }),
  };
};

const onboardingInput = (
  payload: unknown,
  requestId: string,
): LocalSettingsOnboardingInput | HttpServerResponse.HttpServerResponse => {
  if (!isRecord(payload)) {
    return invalidSettingsInput(requestId, "body", "Onboarding input must be an object.");
  }

  const displayName = requiredString(payload, "displayName");
  const email = requiredString(payload, "email");
  const themePreference = requiredString(payload, "themePreference");
  const enabledAgentProviderIds = optionalStringArray(payload.enabledAgentProviderIds);

  if (displayName === undefined) {
    return invalidSettingsInput(requestId, "displayName", "Display name must be a string.");
  }
  if (email === undefined) {
    return invalidSettingsInput(requestId, "email", "Email must be a string.");
  }
  if (themePreference === undefined) {
    return invalidSettingsInput(requestId, "themePreference", "Theme preference must be a string.");
  }
  if ("enabledAgentProviderIds" in payload && enabledAgentProviderIds === undefined) {
    return invalidSettingsInput(
      requestId,
      "enabledAgentProviderIds",
      "Enabled agent provider ids must be an array of strings.",
    );
  }

  return {
    displayName,
    email,
    ...(enabledAgentProviderIds === undefined ? {} : { enabledAgentProviderIds }),
    themePreference,
  };
};

const preferencesPayload = (payload: unknown): Readonly<Record<string, unknown>> | undefined => {
  if (!isRecord(payload)) return undefined;
  if (isRecord(payload.preferences)) return payload.preferences;
  return payload;
};

const invalidSettingsInput = (
  requestId: string,
  field: string,
  message: string,
): HttpServerResponse.HttpServerResponse =>
  errorResponse(requestId, 400, "INVALID_LOCAL_SETTINGS_INPUT", message, false, { field });

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const requiredString = (
  payload: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined => optionalString(payload[key]);

const optionalStringArray = (value: unknown): ReadonlyArray<string> | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  return value.every((entry) => typeof entry === "string") ? value : undefined;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
