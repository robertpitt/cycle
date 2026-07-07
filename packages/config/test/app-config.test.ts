import { strict as assert } from "node:assert";
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { NodeServices } from "@effect/platform-node";
import { ConfigProvider, Effect, Layer } from "effect";
import { afterEach, describe, it } from "vitest";
import {
  AppConfig,
  AppConfigLive,
  DEFAULT_API_PORT,
  defaultAppConfig,
  parseAppConfig,
  type AppConfigState,
} from "../src/AppConfig.ts";
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

const readPersistedConfig = async (homeDirectory: string): Promise<AppConfigState> =>
  JSON.parse(await readFile(configPath(homeDirectory), "utf8")) as AppConfigState;

const assertGeneratedToken = (token: string): void => {
  assert.match(token, /^[A-Za-z0-9_-]{43}$/u);
};

const assertDefaultConfigWithGeneratedToken = (config: AppConfigState): void => {
  assertGeneratedToken(config.api.staticToken);
  assert.deepEqual(config, {
    ...defaultAppConfig(),
    api: {
      ...defaultAppConfig().api,
      staticToken: config.api.staticToken,
    },
  });
};

describe("@cycle/config AppConfig", () => {
  it("validates app config through Effect Config and ConfigProvider", async () => {
    const valid = await Effect.runPromise(parseAppConfig(defaultAppConfig()));
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
        }),
      ),
    );
  });

  it("creates default config with a generated API token on first read", async () => {
    const homeDirectory = await makeTempDir();
    const config = await runConfig(
      homeDirectory,
      Effect.gen(function* () {
        const appConfig = yield* AppConfig;
        return yield* appConfig.read();
      }),
    );

    assertDefaultConfigWithGeneratedToken(config);
    assert.deepEqual(await readPersistedConfig(homeDirectory), config);
  });

  it("migrates auto API ports to the static desktop API port", async () => {
    const homeDirectory = await makeTempDir();
    const persisted = {
      ...defaultAppConfig(),
      api: {
        ...defaultAppConfig().api,
        port: "auto",
        staticToken: "existing-token",
      },
    } satisfies AppConfigState;

    await mkdir(configDirectory(homeDirectory), { recursive: true });
    await writeFile(configPath(homeDirectory), `${JSON.stringify(persisted, null, 2)}\n`, "utf8");

    const config = await runConfig(
      homeDirectory,
      Effect.gen(function* () {
        const appConfig = yield* AppConfig;
        return yield* appConfig.read();
      }),
    );

    assert.equal(config.api.port, DEFAULT_API_PORT);
    assert.equal((await readPersistedConfig(homeDirectory)).api.port, DEFAULT_API_PORT);
  });

  it("backs up invalid JSON and writes defaults", async () => {
    const homeDirectory = await makeTempDir();
    await mkdir(configDirectory(homeDirectory), { recursive: true });
    await writeFile(configPath(homeDirectory), "{ nope", "utf8");

    const recovered = await runConfig(
      homeDirectory,
      Effect.gen(function* () {
        const appConfig = yield* AppConfig;
        return yield* appConfig.read();
      }),
    );

    const files = await readdir(configDirectory(homeDirectory));
    assertDefaultConfigWithGeneratedToken(recovered);
    assert.equal(
      files.some((file) => file.startsWith("app-config.invalid-")),
      true,
    );
    assert.deepEqual(await readPersistedConfig(homeDirectory), recovered);
  });

  it("salvages valid sections from partially invalid config", async () => {
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

    const recovered = await runConfig(
      homeDirectory,
      Effect.gen(function* () {
        const appConfig = yield* AppConfig;
        return yield* appConfig.read();
      }),
    );

    assert.equal(recovered.profile.displayName, "Robert");
    assert.equal(recovered.onboarding.completed, true);
    assert.equal(recovered.theme.preference, "system");
    assert.equal(recovered.theme.density, "compact");
    assert.equal(recovered.localWorkspace.repositories.length, 1);
    assert.equal(recovered.localWorkspace.repositories[0]?.id, "repo_1");
    assert.equal(recovered.localWorkspace.repositories[0]?.preferences.autoSync, true);
    assert.deepEqual(recovered.agentProviders.preferences, [
      {
        config: {
          sandbox: "true",
        },
        defaultModel: "gpt-test",
        enabled: true,
        executablePath: "/usr/local/bin/codex",
        id: "codex",
        maxConcurrentRuns: 2,
      },
    ]);
  });

  it("provides deterministic in-memory test behavior", async () => {
    const initial = defaultAppConfig();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const appConfig = yield* AppConfig;
        yield* appConfig.setThemePreference("dark");
        yield* appConfig.setInterfaceDensity("spacious");
        return yield* appConfig.read();
      }).pipe(Effect.provide(AppConfigTest(initial))),
    );

    assert.equal(result.theme.preference, "dark");
    assert.equal(result.theme.density, "spacious");
    assert.deepEqual(initial.theme, {
      density: "compact",
      preference: "system",
    });
  });
});
