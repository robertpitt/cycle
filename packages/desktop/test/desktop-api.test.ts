import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentProviderDetector } from "@cycle/agents";
import { AppConfig } from "@cycle/config/app-config";
import { DatabaseService, type DatabaseServiceShape } from "@cycle/database";
import { GitRepository, WorktreeService } from "@cycle/git";
import { NodeServices } from "@effect/platform-node";
import { Data, Effect, Layer } from "effect";
import { afterEach, describe, it } from "vitest";
import { ElectronRuntime } from "../src/ElectronRuntime.ts";
import { DesktopApi, DesktopApiLive } from "../src/DesktopApi.ts";
import { defaultAppConfig, type AppConfigState } from "@cycle/contracts/schemas/app";
import { RepositoryBootstrap as DesktopBootstrap } from "@cycle/backend/bootstrap";
import { LocalWorkspace } from "@cycle/backend/workspace";
import { DesktopLogger } from "../src/DesktopLogger.ts";
import { ElectronPreferences } from "../src/ElectronPreferences.ts";

const temporaryDirectories: Array<string> = [];

class TestFailure extends Data.TaggedError("TestFailure")<{
  readonly cause?: unknown;
  readonly message: string;
}> {}

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

const databaseStub = (overrides: Partial<DatabaseServiceShape>): DatabaseServiceShape =>
  new Proxy(overrides, {
    get: (target, property) => {
      if (property in target) return target[property as keyof DatabaseServiceShape];

      return () => Effect.die(new Error(`Unexpected database call: ${String(property)}`));
    },
  }) as DatabaseServiceShape;

const makeLayer = (config: AppConfigState) =>
  Layer.mergeAll(
    NodeServices.layer,
    Layer.succeed(
      AgentProviderDetector,
      AgentProviderDetector.of({
        detect: () => Effect.succeed([]),
      }),
    ),
    Layer.succeed(
      AppConfig,
      AppConfig.of({
        configPath: Effect.succeed("test-app-config.json"),
        getThemePreference: () => Effect.succeed(config.theme.preference),
        read: () => Effect.succeed(config),
        replace: (next) => Effect.succeed(next),
        setInterfaceDensity: (density) =>
          Effect.succeed({
            ...config,
            theme: {
              ...config.theme,
              density,
            },
          }),
        setThemePreference: (preference) =>
          Effect.succeed({
            ...config,
            theme: {
              ...config.theme,
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
      ElectronRuntime,
      ElectronRuntime.of({
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
      ElectronPreferences,
      ElectronPreferences.of({
        clearCache: () => Effect.void,
        completeOnboarding: () => Effect.succeed(config),
        read: () => Effect.succeed(config),
        removeRepository: () => Effect.succeed(config),
        setInterfaceDensity: (density) =>
          Effect.succeed({
            ...config,
            theme: {
              ...config.theme,
              density,
            },
          }),
        setThemePreference: (preference) =>
          Effect.succeed({
            ...config,
            theme: {
              ...config.theme,
              preference,
            },
          }),
        updateAgentProviderPreference: () => Effect.succeed(config),
        shouldAutoSyncRepository: () => Effect.succeed(false),
        startThemeLifecycleSupervision: () => Effect.void,
        syncThemePreference: () =>
          Effect.succeed({
            resolvedMode: "light",
            shouldUseDarkColors: false,
            source: config.theme.preference,
          }),
        themeState: Effect.succeed({
          resolvedMode: "light",
          shouldUseDarkColors: false,
          source: config.theme.preference,
        }),
        updateProfile: (input) =>
          Effect.succeed({
            displayName: input.displayName ?? config.profile.displayName,
            email: input.email ?? config.profile.email,
          }),
        updateRepositoryPreferences: () => Effect.succeed(null),
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
      WorktreeService,
      WorktreeService.of({
        cleanupWorktree: () => Effect.die("not implemented"),
        commitWorktree: () => Effect.die("not implemented"),
        createDisposableWorktree: () => Effect.die("not implemented"),
        createImplementationWorktree: () => Effect.die("not implemented"),
        createOrUpdateBranch: () => Effect.die("not implemented"),
        diffWorktree: () => Effect.die("not implemented"),
        inspectWorktree: () => Effect.die("not implemented"),
        retainWorktree: () => Effect.die("not implemented"),
      }),
    ),
    DesktopApiLive,
    Layer.succeed(DatabaseService, DatabaseService.of(databaseStub({}))),
  );

describe("desktop API startup", () => {
  it("starts REST and MCP on the desktop API server", async () => {
    const directory = await makeTempDir();
    const runtimeFile = join(directory, "runtime.json");
    const config = makeConfig();

    await withEnv(
      {
        CYCLE_API_RUNTIME_FILE: runtimeFile,
        HOME: directory,
      },
      () =>
        Effect.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              const desktopApi = yield* DesktopApi;
              yield* desktopApi.start();

              const runtime = JSON.parse(
                yield* Effect.tryPromise({
                  try: () => readFile(runtimeFile, "utf8"),
                  catch: (cause) =>
                    new TestFailure({ cause, message: "failed to read runtime file" }),
                }),
              ) as {
                readonly baseUrl: string;
                readonly mcpPath?: string;
                readonly mcpUrl?: string;
              };

              const health = yield* Effect.tryPromise({
                try: () => fetch(`${runtime.baseUrl}/health`),
                catch: (cause) => new TestFailure({ cause, message: "health request failed" }),
              });
              const mcp = yield* Effect.tryPromise({
                try: () =>
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
                catch: (cause) => new TestFailure({ cause, message: "mcp request failed" }),
              });

              assert.equal(health.status, 200);
              assert.equal(runtime.mcpPath, "/mcp");
              assert.equal(runtime.mcpUrl, `${runtime.baseUrl}/mcp`);
              assert.equal(mcp.status, 401);
            }).pipe(Effect.provide(makeLayer(config))),
          ),
        ),
    );
  });
});
