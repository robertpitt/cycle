import { NodeServices } from "@effect/platform-node";
import { ConfigProvider, Crypto, Effect, FileSystem, Layer, Path, Schema } from "effect";
import { AppConfig, AppConfigLive } from "./AppConfig.ts";

export type CycleApiDiscoveryInput = {
  readonly apiToken?: string;
  readonly apiUrl?: string;
  readonly env: Readonly<Record<string, string | undefined>>;
};

export type CycleApiDiscoveryResult = {
  readonly baseUrl: string;
  readonly token: string;
};

const UnknownRecord = Schema.Record(Schema.String, Schema.Unknown);

export const RuntimeDiscoveryFile = Schema.StructWithRest(
  Schema.Struct({
    baseUrl: Schema.optional(Schema.String),
    mcpPath: Schema.optional(Schema.String),
    mcpUrl: Schema.optional(Schema.String),
    pid: Schema.optional(Schema.Number),
    specUrl: Schema.optional(Schema.String),
    startedAt: Schema.optional(Schema.String),
  }),
  [UnknownRecord],
);
export type RuntimeDiscoveryFile = typeof RuntimeDiscoveryFile.Type;

export const discoverCycleApi = (input: CycleApiDiscoveryInput): Promise<CycleApiDiscoveryResult> =>
  Effect.runPromise(discoverCycleApiEffect(input).pipe(Effect.provide(NodeServices.layer)));

export const discoverCycleApiEffect = (
  input: CycleApiDiscoveryInput,
): Effect.Effect<
  CycleApiDiscoveryResult,
  CycleApiDiscoveryError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    if (input.apiUrl !== undefined && input.apiToken !== undefined) {
      return {
        baseUrl: normalizeBaseUrl(input.apiUrl),
        token: input.apiToken,
      };
    }

    if (input.env.CYCLE_API_URL !== undefined && input.env.CYCLE_API_TOKEN !== undefined) {
      return {
        baseUrl: normalizeBaseUrl(input.env.CYCLE_API_URL),
        token: input.env.CYCLE_API_TOKEN,
      };
    }

    const token =
      input.apiToken ?? input.env.CYCLE_API_TOKEN ?? (yield* readAppConfigApiToken(input.env));
    const runtime = yield* readRuntimeDiscovery(input.env);

    if (runtime?.baseUrl !== undefined && token !== undefined) {
      return {
        baseUrl: normalizeBaseUrl(runtime.baseUrl),
        token,
      };
    }

    if (token !== undefined) {
      return {
        baseUrl: normalizeBaseUrl(input.env.CYCLE_API_URL_DEFAULT ?? "http://127.0.0.1:4738"),
        token,
      };
    }

    return yield* Effect.fail({
      _tag: "CycleApiDiscoveryError" as const,
      code: "API_UNAVAILABLE" as const,
      message: "No Cycle API URL/token was supplied and no local app config token was found.",
    });
  });

const readRuntimeDiscovery = (
  env: Readonly<Record<string, string | undefined>>,
): Effect.Effect<RuntimeDiscoveryFile | undefined, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const runtimePath =
      trimNonEmpty(env.CYCLE_API_RUNTIME_FILE) ??
      path.join(
        trimNonEmpty(env.TMPDIR) ?? trimNonEmpty(env.TMP) ?? trimNonEmpty(env.TEMP) ?? "/tmp",
        `cycle-api-${globalThis.process?.getuid?.() ?? "user"}.json`,
      );

    if (!(yield* fs.exists(runtimePath).pipe(Effect.catch(() => Effect.succeed(false))))) {
      return undefined;
    }

    const text = yield* fs.readFileString(runtimePath, "utf8");
    return yield* Effect.try({
      try: () => Schema.decodeUnknownSync(RuntimeDiscoveryFile)(JSON.parse(text) as unknown),
      catch: (cause) => cause,
    });
  }).pipe(Effect.catch(() => Effect.as(Effect.void, undefined)));

const readAppConfigApiToken = (
  env: Readonly<Record<string, string | undefined>>,
): Effect.Effect<string | undefined, never, Crypto.Crypto | FileSystem.FileSystem | Path.Path> =>
  AppConfig.pipe(
    Effect.flatMap((appConfig) => appConfig.read()),
    Effect.map((config) => {
      const token = config.api.staticToken.trim();
      return token.length === 0 ? undefined : token;
    }),
    Effect.provide(
      AppConfigLive.pipe(
        Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env: definedEnv(env) }))),
      ),
    ),
    Effect.catch(() => Effect.as(Effect.void, undefined)),
  );

const normalizeBaseUrl = (value: string): string => value.replace(/\/+$/u, "");

const trimNonEmpty = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};

const definedEnv = (env: Readonly<Record<string, string | undefined>>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );

export type CycleApiDiscoveryError = {
  readonly _tag: "CycleApiDiscoveryError";
  readonly code: "API_UNAVAILABLE";
  readonly message: string;
};
