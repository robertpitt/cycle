import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { NodeServices } from "@effect/platform-node";
import { ConfigProvider, Effect, Layer } from "effect";
import { afterEach, describe, it } from "vitest";
import { AppConfig, AppConfigLive } from "../src/AppConfig.ts";
import {
  appConfigStaticToken,
  DEFAULT_API_PORT,
  defaultAppConfig,
  defaultAppConfigState,
  parseAppConfig,
  type AppConfigEncoded,
  type AppConfigState,
} from "@cycle/config";
import { AppConfigTest } from "../src/testing/index.ts";

const temporaryDirectories: Array<string> = [];

const makeTempDir = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), "cycle-config-"));
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

const makeConfigLayer = (homeDirectory: string) =>
  AppConfigLive.pipe(
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env: { HOME: homeDirectory } }))),
    Layer.provide(NodeServices.layer),
  );

const runConfig = <A>(homeDirectory: string, effect: Effect.Effect<A, unknown, AppConfig>) =>
  Effect.runPromise(effect.pipe(Effect.provide(makeConfigLayer(homeDirectory))));

const configPath = (homeDirectory: string): string =>
  join(homeDirectory, ".cycle", "app-config.json");

const configDirectory = (homeDirectory: string): string => dirname(configPath(homeDirectory));

const readPersistedConfig = async (homeDirectory: string): Promise<AppConfigEncoded> =>
  JSON.parse(await readFile(configPath(homeDirectory), "utf8")) as AppConfigEncoded;

const assertGeneratedToken = (token: string): void => {
  assert.match(token, /^[A-Za-z0-9_-]{43}$/u);
};

const assertDefaultConfigWithGeneratedToken = (config: AppConfigState): void => {
  const staticToken = appConfigStaticToken(config);
  assertGeneratedToken(staticToken);
  assert.deepEqual(toEncodedConfig(config), defaultAppConfig(staticToken));
};

const toEncodedConfig = (config: AppConfigState): AppConfigEncoded => ({
  ...config,
  api: {
    ...config.api,
    staticToken: appConfigStaticToken(config),
  },
});

describe("@cycle/config AppConfig", () => {
  it("validates app config through Effect Config and ConfigProvider", async () => {
    const valid = await Effect.runPromise(
      parseAppConfig(defaultAppConfig()).pipe(Effect.provide(NodeServices.layer)),
    );
    assert.equal(valid.schemaVersion, defaultAppConfig().schemaVersion);
    assert.equal(valid.api.port, DEFAULT_API_PORT);

    await assert.rejects(() =>
      Effect.runPromise(
        parseAppConfig({
          ...defaultAppConfig(),
          theme: {
            density: "compact",
            preference: "sepia",
          },
        }).pipe(Effect.provide(NodeServices.layer)),
      ),
    );
  });

  it("creates default config with a generated API token on first read", async () => {
    const homeDirectory = await makeTempDir();
    const config = await runConfig(
      homeDirectory,
      Effect.gen(function* () {
        const appConfig = yield* AppConfig;
        return yield* appConfig.read;
      }),
    );

    assertDefaultConfigWithGeneratedToken(config);
    assert.deepEqual(await readPersistedConfig(homeDirectory), toEncodedConfig(config));
    assert.deepEqual(await readdir(configDirectory(homeDirectory)), ["app-config.json"]);
  });

  it("persists effectful defaults for existing partial config", async () => {
    const homeDirectory = await makeTempDir();
    await mkdir(configDirectory(homeDirectory), { recursive: true });
    await writeFile(configPath(homeDirectory), "{}", "utf8");

    const [first, second] = await runConfig(
      homeDirectory,
      Effect.gen(function* () {
        const appConfig = yield* AppConfig;
        return [yield* appConfig.read, yield* appConfig.read] as const;
      }),
    );

    const token = appConfigStaticToken(first);
    assertGeneratedToken(token);
    assert.equal(appConfigStaticToken(second), token);
    assert.equal((await readPersistedConfig(homeDirectory)).api.staticToken, token);
  });

  it("preserves explicitly configured auto API ports", async () => {
    const homeDirectory = await makeTempDir();
    const persisted = {
      ...defaultAppConfig(),
      api: {
        ...defaultAppConfig().api,
        port: "auto",
        staticToken: "existing-token",
      },
    } satisfies AppConfigEncoded;

    await mkdir(configDirectory(homeDirectory), { recursive: true });
    await writeFile(configPath(homeDirectory), `${JSON.stringify(persisted, null, 2)}\n`, "utf8");

    const config = await runConfig(
      homeDirectory,
      Effect.gen(function* () {
        const appConfig = yield* AppConfig;
        return yield* appConfig.read;
      }),
    );

    assert.equal(config.api.port, "auto");
    assert.equal((await readPersistedConfig(homeDirectory)).api.port, "auto");
  });

  it("fails invalid JSON without replacing the file", async () => {
    const homeDirectory = await makeTempDir();
    await mkdir(configDirectory(homeDirectory), { recursive: true });
    await writeFile(configPath(homeDirectory), "{ nope", "utf8");

    await assert.rejects(() =>
      runConfig(
        homeDirectory,
        Effect.gen(function* () {
          const appConfig = yield* AppConfig;
          return yield* appConfig.read;
        }),
      ),
    );
    assert.equal(await readFile(configPath(homeDirectory), "utf8"), "{ nope");
  });

  it("fails partially invalid config without salvaging sections", async () => {
    const homeDirectory = await makeTempDir();
    await mkdir(configDirectory(homeDirectory), { recursive: true });
    await writeFile(
      configPath(homeDirectory),
      JSON.stringify({
        agentProviders: {
          preferences: [
            {
              config: {
                sandbox: true,
              },
              defaultModel: "  gpt-test  ",
              enabled: true,
              executablePath: "  /usr/local/bin/codex  ",
              id: "codex",
              maxConcurrentRuns: 2,
            },
            {
              enabled: true,
              id: "unknown",
            },
          ],
        },
        localWorkspace: {
          repositories: [
            {
              addedAt: "2026-01-01T00:00:00.000Z",
              displayName: "Cycle",
              id: "repo_1",
              path: "/tmp/cycle",
            },
            {
              displayName: "Broken",
            },
          ],
        },
        onboarding: {
          completed: true,
          completedAt: "2026-01-01T00:00:00.000Z",
        },
        profile: {
          displayName: "Robert",
          email: "robert@example.com",
        },
        schemaVersion: 1,
        theme: {
          preference: "sepia",
        },
      }),
      "utf8",
    );

    await assert.rejects(() =>
      runConfig(
        homeDirectory,
        Effect.gen(function* () {
          const appConfig = yield* AppConfig;
          return yield* appConfig.read;
        }),
      ),
    );
  });

  it("provides deterministic in-memory test behavior", async () => {
    const initial = defaultAppConfigState();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const appConfig = yield* AppConfig;
        yield* appConfig.update((current) => ({
          ...current,
          theme: { density: "spacious", preference: "dark" },
        }));
        return yield* appConfig.read;
      }).pipe(Effect.provide(AppConfigTest(initial))),
    );

    assert.equal(result.theme.preference, "dark");
    assert.equal(result.theme.density, "spacious");
    assert.deepEqual(initial.theme, {
      density: "compact",
      preference: "system",
    });
  });

  it("serializes concurrent updates", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const appConfig = yield* AppConfig;
        yield* Effect.all(
          [
            appConfig.update((current) => ({
              ...current,
              theme: { ...current.theme, preference: "dark" },
            })),
            appConfig.update((current) => ({
              ...current,
              theme: { ...current.theme, density: "spacious" },
            })),
          ],
          { concurrency: "unbounded" },
        );
        return yield* appConfig.read;
      }).pipe(Effect.provide(AppConfigTest())),
    );

    assert.deepEqual(result.theme, { density: "spacious", preference: "dark" });
  });
});
