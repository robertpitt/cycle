import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path } from "effect";

export type CliDiscoveryInput = {
  readonly apiUrlFlag?: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly tokenFlag?: string;
};

export type CliDiscoveryResult = {
  readonly baseUrl: string;
  readonly token: string;
};

type RuntimeDiscoveryFile = {
  readonly baseUrl?: unknown;
};

type CycleConfigFile = {
  readonly api?: {
    readonly staticToken?: unknown;
  };
};

export const discoverApi = async (input: CliDiscoveryInput): Promise<CliDiscoveryResult> =>
  Effect.runPromise(discoverApiEffect(input).pipe(Effect.provide(NodeServices.layer)));

export const discoverApiEffect = (
  input: CliDiscoveryInput,
): Effect.Effect<CliDiscoveryResult, CliDiscoveryError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    if (input.apiUrlFlag !== undefined && input.tokenFlag !== undefined) {
      return {
        baseUrl: normalizeBaseUrl(input.apiUrlFlag),
        token: input.tokenFlag,
      };
    }

    if (input.env.CYCLE_API_URL !== undefined && input.env.CYCLE_API_TOKEN !== undefined) {
      return {
        baseUrl: normalizeBaseUrl(input.env.CYCLE_API_URL),
        token: input.env.CYCLE_API_TOKEN,
      };
    }

    const token = yield* readConfigToken(input.env);
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
      cliDiscoveryError(
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

    const parsed = JSON.parse(yield* fs.readFileString(path, "utf8")) as RuntimeDiscoveryFile;

    return typeof parsed.baseUrl === "string" ? { baseUrl: parsed.baseUrl } : undefined;
  }).pipe(Effect.catch(() => Effect.as(Effect.void, undefined)));

const readConfigToken = (
  env: Readonly<Record<string, string | undefined>>,
): Effect.Effect<string | undefined, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* defaultConfigPath(env);

    if (!(yield* fs.exists(path).pipe(Effect.catch(() => Effect.succeed(false))))) {
      return undefined;
    }

    const parsed = JSON.parse(yield* fs.readFileString(path, "utf8")) as CycleConfigFile;
    const token = parsed.api?.staticToken;

    return typeof token === "string" && token.length > 0 ? token : undefined;
  }).pipe(Effect.catch(() => Effect.as(Effect.void, undefined)));

const normalizeBaseUrl = (value: string): string => value.replace(/\/+$/u, "");

const tempDirFromEnv = (env: Readonly<Record<string, string | undefined>>): string =>
  env.TMPDIR ?? env.TMP ?? env.TEMP ?? "/tmp";

const homeDirFromEnv = (env: Readonly<Record<string, string | undefined>>): string =>
  env.HOME ?? ".";

export type CliDiscoveryError = {
  readonly _tag: "CliDiscoveryError";
  readonly code: "API_UNAVAILABLE";
  readonly message: string;
};

const cliDiscoveryError = (
  code: CliDiscoveryError["code"],
  message: string,
): CliDiscoveryError => ({
  _tag: "CliDiscoveryError",
  code,
  message,
});
