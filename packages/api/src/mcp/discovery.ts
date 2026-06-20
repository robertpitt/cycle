import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path, Schema } from "effect";

export type CycleMcpApiDiscoveryInput = {
  readonly apiToken?: string;
  readonly apiUrl?: string;
  readonly env: Readonly<Record<string, string | undefined>>;
};

export type CycleMcpApiDiscoveryResult = {
  readonly baseUrl: string;
  readonly token: string;
};

const UnknownRecord = Schema.Record(Schema.String, Schema.Unknown);
// Discovery/config files may contain fields owned by other processes; MCP only
// decodes the projection it needs and treats the rest as extension data.
const RuntimeDiscoveryFile = Schema.StructWithRest(
  Schema.Struct({
    baseUrl: Schema.optional(Schema.String),
  }),
  [UnknownRecord],
);
const CycleConfigFile = Schema.StructWithRest(
  Schema.Struct({
    api: Schema.optional(
      Schema.StructWithRest(
        Schema.Struct({
          staticToken: Schema.optional(Schema.String),
        }),
        [UnknownRecord],
      ),
    ),
  }),
  [UnknownRecord],
);

export const discoverCycleApi = (
  input: CycleMcpApiDiscoveryInput,
): Promise<CycleMcpApiDiscoveryResult> =>
  Effect.runPromise(discoverCycleApiEffect(input).pipe(Effect.provide(NodeServices.layer)));

export const discoverCycleApiEffect = (
  input: CycleMcpApiDiscoveryInput,
): Effect.Effect<
  CycleMcpApiDiscoveryResult,
  CycleMcpDiscoveryError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const explicitToken = input.apiToken ?? input.env.CYCLE_API_TOKEN;

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

    const token = explicitToken ?? (yield* readConfigToken(input.env));
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

    return yield* Effect.fail(
      cycleMcpDiscoveryError(
        "API_UNAVAILABLE",
        "No Cycle API URL/token was supplied and no local config token was found.",
      ),
    );
  });

export const defaultRuntimeDiscoveryPath = (
  env: Readonly<Record<string, string | undefined>>,
): Effect.Effect<string, never, Path.Path> =>
  Effect.map(
    Path.Path,
    (path) =>
      env.CYCLE_API_RUNTIME_FILE ??
      path.join(tempDirFromEnv(env), `cycle-api-${globalThis.process?.getuid?.() ?? "user"}.json`),
  );

export const defaultConfigPath = (
  env: Readonly<Record<string, string | undefined>>,
): Effect.Effect<string, never, Path.Path> =>
  Effect.map(
    Path.Path,
    (path) => env.CYCLE_CONFIG_PATH ?? path.join(homeDirFromEnv(env), ".cycle", "config.json"),
  );

const readRuntimeDiscovery = (
  env: Readonly<Record<string, string | undefined>>,
): Effect.Effect<
  { readonly baseUrl: string } | undefined,
  never,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* defaultRuntimeDiscoveryPath(env);

    if (!(yield* fs.exists(path).pipe(Effect.catch(() => Effect.succeed(false))))) {
      return undefined;
    }

    const parsed = decodeRuntimeDiscoveryFile(yield* fs.readFileString(path, "utf8"));

    return parsed.baseUrl === undefined ? undefined : { baseUrl: parsed.baseUrl };
  }).pipe(Effect.catch(() => Effect.succeed(undefined)));

const readConfigToken = (
  env: Readonly<Record<string, string | undefined>>,
): Effect.Effect<string | undefined, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* defaultConfigPath(env);

    if (!(yield* fs.exists(path).pipe(Effect.catch(() => Effect.succeed(false))))) {
      return undefined;
    }

    const parsed = decodeCycleConfigFile(yield* fs.readFileString(path, "utf8"));
    const token = parsed.api?.staticToken;

    return token !== undefined && token.length > 0 ? token : undefined;
  }).pipe(Effect.catch(() => Effect.succeed(undefined)));

const decodeRuntimeDiscoveryFile = (text: string): typeof RuntimeDiscoveryFile.Type => {
  const parsed = JSON.parse(text) as unknown;
  return Schema.decodeUnknownSync(RuntimeDiscoveryFile)(parsed);
};

const decodeCycleConfigFile = (text: string): typeof CycleConfigFile.Type => {
  const parsed = JSON.parse(text) as unknown;
  return Schema.decodeUnknownSync(CycleConfigFile)(parsed);
};

const normalizeBaseUrl = (value: string): string => value.replace(/\/+$/u, "");

const tempDirFromEnv = (env: Readonly<Record<string, string | undefined>>): string =>
  env.TMPDIR ?? env.TMP ?? env.TEMP ?? "/tmp";

const homeDirFromEnv = (env: Readonly<Record<string, string | undefined>>): string =>
  env.HOME ?? ".";

export type CycleMcpDiscoveryError = {
  readonly _tag: "CycleMcpDiscoveryError";
  readonly code: "API_UNAVAILABLE";
  readonly message: string;
};

export const cycleMcpDiscoveryError = (
  code: CycleMcpDiscoveryError["code"],
  message: string,
): CycleMcpDiscoveryError => ({
  _tag: "CycleMcpDiscoveryError",
  code,
  message,
});
