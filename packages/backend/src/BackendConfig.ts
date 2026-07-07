import { Config, Effect, Path, Schema } from "effect";

const RuntimeDiscoveryRest = Schema.Record(Schema.String, Schema.Unknown);

export const BackendRuntimeDiscoveryFile = Schema.StructWithRest(
  Schema.Struct({
    apiVersion: Schema.optional(Schema.String),
    baseUrl: Schema.optional(Schema.String),
    mcpPath: Schema.optional(Schema.String),
    mcpUrl: Schema.optional(Schema.String),
    pid: Schema.optional(Schema.Number),
    specUrl: Schema.optional(Schema.String),
    startedAt: Schema.optional(Schema.String),
  }),
  [RuntimeDiscoveryRest],
);
export type BackendRuntimeDiscoveryFile = typeof BackendRuntimeDiscoveryFile.Type;

export type BackendPaths = {
  readonly agentWorktreesPath: string;
  readonly cycleHome: string;
  readonly databasePath: string;
  readonly runtimeDiscoveryPath: string;
};

export type BackendStartOptions = {
  readonly host?: "127.0.0.1" | "localhost";
  readonly port?: number | "auto";
  readonly runtimeFile?: string;
};

export const homeDirectoryConfig = Config.string("HOME").pipe(
  Config.withDefault("."),
  Config.map((value) => value.trim() || "."),
);

export const tempDirectoryConfig = Config.string("TMPDIR").pipe(
  Config.orElse(() => Config.string("TMP")),
  Config.orElse(() => Config.string("TEMP")),
  Config.withDefault("/tmp"),
  Config.map((value) => value.trim() || "/tmp"),
);

export const backendRuntimeDiscoveryPath = Effect.gen(function* () {
  const path = yield* Path.Path;
  const tempDirectory = yield* tempDirectoryConfig;
  const configuredPath = yield* Config.string("CYCLE_API_RUNTIME_FILE").pipe(
    Config.withDefault(""),
    Config.map((value) => value.trim()),
  );

  return (
    configuredPath ||
    path.join(tempDirectory, `cycle-api-${globalThis.process?.getuid?.() ?? "user"}.json`)
  );
});

export const backendPaths = (options: BackendStartOptions = {}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const homeDirectory = yield* homeDirectoryConfig;
    const cycleHome = path.join(homeDirectory, ".cycle");
    const runtimeDiscoveryPath =
      options.runtimeFile === undefined || options.runtimeFile.trim().length === 0
        ? yield* backendRuntimeDiscoveryPath
        : options.runtimeFile;

    return {
      agentWorktreesPath: path.join(cycleHome, "agent-task-worktrees"),
      cycleHome,
      databasePath: path.join(cycleHome, "cycle.db"),
      runtimeDiscoveryPath,
    };
  });

export const runtimeBaseUrlFromDiscovery = (value: unknown): string | undefined => {
  const parsed = Schema.decodeUnknownSync(BackendRuntimeDiscoveryFile)(value);
  return parsed.baseUrl === undefined || parsed.baseUrl.length === 0
    ? undefined
    : parsed.baseUrl.replace(/\/+$/u, "");
};

export const parseRuntimeBaseUrlFromDiscoveryText = (text: string): string | undefined =>
  runtimeBaseUrlFromDiscovery(JSON.parse(text) as unknown);
