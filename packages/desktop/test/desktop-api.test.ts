import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitRepository } from "@cycle/git";
import { UseCaseRunner } from "@cycle/usecases";
import { Effect, Layer } from "effect";
import { afterEach, describe, it } from "vitest";
import { DesktopRuntime } from "../src/platform/DesktopRuntime.ts";
import { AppConfig, defaultAppConfig, type AppConfigState } from "../src/shared/AppConfig.ts";
import { DesktopBootstrap } from "../src/shared/Bootstrap.ts";
import { LocalWorkspace } from "../src/shared/LocalWorkspace.ts";
import { startDesktopApi } from "../src/main/DesktopApi.ts";
import { DesktopLogger } from "../src/main/DesktopLoggerLive.ts";

const temporaryDirectories: Array<string> = [];

const makeTempDir = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), "cycle-desktop-api-"));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

const withEnv = async <A>(
  env: Readonly<Record<string, string>>,
  run: () => Promise<A>,
): Promise<A> => {
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));

  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }

  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

const makeConfig = (): AppConfigState => ({
  ...defaultAppConfig(),
  api: {
    enabled: true,
    host: "127.0.0.1",
    port: 0,
    staticToken: "desktop-api-test-token",
  },
});

const makeLayer = (config: AppConfigState) =>
  Layer.mergeAll(
    Layer.succeed(
      AppConfig,
      AppConfig.of({
        configPath: Effect.succeed("test-app-config.json"),
        getThemePreference: () => Effect.succeed(config.theme.preference),
        read: () => Effect.succeed(config),
        replace: (next) => Effect.succeed(next),
        setThemePreference: (preference) =>
          Effect.succeed({
            ...config,
            theme: {
              preference,
            },
          }),
        update: (mutator) => Effect.succeed(mutator(config)),
      }),
    ),
    Layer.succeed(
      DesktopLogger,
      DesktopLogger.of({
        debug: () => Effect.void,
        error: () => Effect.void,
        info: () => Effect.void,
        path: Effect.succeed("cycle.jsonl"),
        warn: () => Effect.void,
      }),
    ),
    Layer.succeed(
      DesktopRuntime,
      DesktopRuntime.of({
        run: (_label, effect) => {
          Effect.runFork(effect as Effect.Effect<void>);
        },
        runPromise: (_label, effect) => Effect.runPromise(effect as Effect.Effect<unknown>) as any,
      }),
    ),
    Layer.succeed(
      LocalWorkspace,
      LocalWorkspace.of({
        initializeRepositoryPath: () => Effect.die("not implemented"),
        listRepositories: () => Effect.succeed([]),
        markRepositoryOpened: () => Effect.succeed(null),
        removeRepository: () => Effect.succeed([]),
        updateRepositoryPreferences: () => Effect.succeed(null),
        upsertRepositoryPath: () => Effect.die("not implemented"),
      }),
    ),
    Layer.succeed(
      DesktopBootstrap,
      DesktopBootstrap.of({
        ensureRepositoryOpened: () => Effect.void,
        notifyRepositoryChanged: () => Effect.void,
        pushRepositoryToRemote: () => Effect.die("not implemented"),
        start: () => Effect.void,
        status: () =>
          Effect.succeed({
            blocking: false,
            message: "ready",
            phase: "ready",
            repositories: [],
          }),
        syncRepositoryFromRemote: () => Effect.void,
      }),
    ),
    Layer.succeed(
      GitRepository,
      GitRepository.of({
        ensure: () => Effect.die("not implemented"),
        init: () => Effect.die("not implemented"),
        inspect: () => Effect.die("not implemented"),
        metadata: () => Effect.die("not implemented"),
        resolveGitDir: () => Effect.die("not implemented"),
      }),
    ),
    Layer.succeed(
      UseCaseRunner,
      UseCaseRunner.of({
        run: () => Effect.die("not implemented"),
      }),
    ),
  );

describe("desktop API startup", () => {
  it("starts REST and MCP on the desktop API server", async () => {
    const directory = await makeTempDir();
    const runtimeFile = join(directory, "runtime.json");
    const configFile = join(directory, "config.json");
    const config = makeConfig();

    await withEnv(
      {
        CYCLE_API_RUNTIME_FILE: runtimeFile,
        CYCLE_CONFIG_PATH: configFile,
      },
      () =>
        Effect.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              yield* startDesktopApi();

              const runtime = JSON.parse(
                yield* Effect.promise(() => readFile(runtimeFile, "utf8")),
              ) as {
                readonly baseUrl: string;
                readonly mcpPath?: string;
                readonly mcpUrl?: string;
              };
              const cliConfig = JSON.parse(
                yield* Effect.promise(() => readFile(configFile, "utf8")),
              ) as {
                readonly api?: {
                  readonly staticToken?: string;
                };
              };

              const health = yield* Effect.promise(() => fetch(`${runtime.baseUrl}/health`));
              const mcp = yield* Effect.promise(() =>
                fetch(runtime.mcpUrl ?? `${runtime.baseUrl}/mcp`, {
                  body: JSON.stringify({
                    id: 1,
                    jsonrpc: "2.0",
                    method: "ping",
                    params: {},
                  }),
                  headers: {
                    "content-type": "application/json",
                  },
                  method: "POST",
                }),
              );

              assert.equal(health.status, 200);
              assert.equal(runtime.mcpPath, "/mcp");
              assert.equal(runtime.mcpUrl, `${runtime.baseUrl}/mcp`);
              assert.equal(mcp.status, 401);
              assert.equal(cliConfig.api?.staticToken, config.api.staticToken);
            }).pipe(Effect.provide(makeLayer(config))),
          ),
        ),
    );
  });
});
