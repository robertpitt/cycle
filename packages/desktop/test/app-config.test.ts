import { strict as assert } from "node:assert";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { ConfigProvider, Effect, Layer } from "effect";
import { detectAgentProviders } from "@cycle/agents";
import { AppConfig, AppConfigLive, parseAppConfig } from "@cycle/config";
import { GitRepositoryLive } from "@cycle/git";
import { GitStoresTestLive } from "@cycle/git-store/testing";
import { NodeServices } from "@effect/platform-node";
import { afterEach, describe, it } from "vitest";
import { LocalWorkspace, LocalWorkspaceLive } from "@cycle/backend/workspace";
import {
  appConfigStaticToken,
  DEFAULT_API_PORT,
  defaultAppConfig,
  type AppConfigEncoded,
  type AppConfigState,
} from "@cycle/config";
import { Profile } from "../src/shared/Profile.ts";
import { ProfileLive } from "../src/ProfileLive.ts";
import { LocalSettingsLive } from "@cycle/backend/settings";

const temporaryDirectories: Array<string> = [];
const execFileAsync = promisify(execFile);

const makeTempDir = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), "cycle-desktop-"));
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

const makeConfigLayer = (userData: string) =>
  AppConfigLive.pipe(
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env: { HOME: userData } }))),
    Layer.provide(NodeServices.layer),
  );

const makeServicesLayer = (userData: string) => {
  const appConfig = makeConfigLayer(userData);
  const gitRepository = GitRepositoryLive;
  const localWorkspace = LocalWorkspaceLive.pipe(
    Layer.provide(Layer.mergeAll(appConfig, gitRepository, GitStoresTestLive)),
  );
  const localSettings = LocalSettingsLive.pipe(
    Layer.provide(Layer.mergeAll(appConfig, localWorkspace)),
  );

  return Layer.mergeAll(
    appConfig,
    ProfileLive.pipe(Layer.provide(localSettings)),
    gitRepository,
    localWorkspace,
    localSettings,
  ).pipe(Layer.provide(NodeServices.layer));
};

const runConfig = <A>(userData: string, effect: Effect.Effect<A, unknown, AppConfig>) =>
  Effect.runPromise(effect.pipe(Effect.provide(makeConfigLayer(userData))));

const runServices = <A>(
  userData: string,
  effect: Effect.Effect<A, unknown, AppConfig | Profile | LocalWorkspace>,
) => Effect.runPromise(effect.pipe(Effect.provide(makeServicesLayer(userData))));

const configPath = (userData: string): string => join(userData, ".cycle", "app-config.json");

const configDirectory = (userData: string): string => dirname(configPath(userData));

const readPersistedConfig = async (userData: string): Promise<AppConfigEncoded> =>
  JSON.parse(await readFile(configPath(userData), "utf8")) as AppConfigEncoded;

const readCycleRootCommit = async (repositoryPath: string): Promise<string> => {
  const { stdout } = await execFileAsync(
    "git",
    ["rev-list", "--max-parents=0", "refs/gitdb/cycle/main"],
    {
      cwd: repositoryPath,
    },
  );

  return stdout.trim();
};

const repositoryIdForCycleRoot = (rootCommit: string): string =>
  `repo_${rootCommit.toLowerCase().slice(0, 5)}`;

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

describe("desktop app config", () => {
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
            preference: "sepia",
          },
        }).pipe(Effect.provide(NodeServices.layer)),
      ),
    );
  });

  it("creates default config on first run", async () => {
    const userData = await makeTempDir();
    const config = await runConfig(
      userData,
      Effect.gen(function* () {
        const appConfig = yield* AppConfig;
        return yield* appConfig.read;
      }),
    );

    assertDefaultConfigWithGeneratedToken(config);
    assert.deepEqual(await readPersistedConfig(userData), toEncodedConfig(config));
  });

  it("preserves explicitly configured auto API ports", async () => {
    const userData = await makeTempDir();
    const persisted = {
      ...defaultAppConfig(),
      api: {
        ...defaultAppConfig().api,
        port: "auto",
        staticToken: "existing-token",
      },
    } satisfies AppConfigEncoded;

    await mkdir(configDirectory(userData), { recursive: true });
    await writeFile(configPath(userData), `${JSON.stringify(persisted, null, 2)}\n`, "utf8");

    const config = await runConfig(
      userData,
      Effect.gen(function* () {
        const appConfig = yield* AppConfig;
        return yield* appConfig.read;
      }),
    );

    assert.equal(config.api.port, "auto");
    assert.equal((await readPersistedConfig(userData)).api.port, "auto");
  });

  it("persists profile updates and onboarding completion", async () => {
    const userData = await makeTempDir();

    const result = await runServices(
      userData,
      Effect.gen(function* () {
        const profile = yield* Profile;
        yield* profile.updateProfile({
          displayName: "  Robert Pitt  ",
          email: "  robert@example.com ",
        });
        const updated = yield* profile.getProfile;
        const completed = yield* profile.completeOnboarding({
          displayName: "Robert",
          email: "robert@example.com",
          enabledAgentProviderIds: ["codex"],
          themePreference: "dark",
        });
        return { completed, updated };
      }),
    );

    assert.deepEqual(result.updated, {
      displayName: "Robert Pitt",
      email: "robert@example.com",
    });
    assert.equal(result.completed.onboarding.completed, true);
    assert.equal(typeof result.completed.onboarding.completedAt, "string");
    assert.deepEqual(result.completed.agentProviders.preferences, [
      {
        config: {},
        defaultModel: null,
        enabled: true,
        executablePath: null,
        id: "codex",
        maxConcurrentRuns: null,
      },
      {
        config: {},
        defaultModel: null,
        enabled: false,
        executablePath: null,
        id: "claude-code",
        maxConcurrentRuns: null,
      },
    ]);
    assert.equal(result.completed.theme.preference, "dark");
    assert.deepEqual((await readPersistedConfig(userData)).profile, {
      displayName: "Robert",
      email: "robert@example.com",
    });
  });

  it("persists theme preference and rejects invalid persisted theme values", async () => {
    const userData = await makeTempDir();

    await runConfig(
      userData,
      Effect.gen(function* () {
        const appConfig = yield* AppConfig;
        yield* appConfig.update((current) => ({
          ...current,
          theme: { density: "spacious", preference: "light" },
        }));
      }),
    );

    assert.equal((await readPersistedConfig(userData)).theme.preference, "light");
    assert.equal((await readPersistedConfig(userData)).theme.density, "spacious");

    await writeFile(
      configPath(userData),
      JSON.stringify({
        ...defaultAppConfig(),
        theme: {
          preference: "sepia",
        },
      }),
      "utf8",
    );

    await assert.rejects(() =>
      runConfig(
        userData,
        Effect.gen(function* () {
          const appConfig = yield* AppConfig;
          return yield* appConfig.read;
        }),
      ),
    );

    assert.equal((await readPersistedConfig(userData)).theme.preference, "sepia");
  });

  it("migrates theme density to compact when missing", async () => {
    const userData = await makeTempDir();

    await mkdir(configDirectory(userData), { recursive: true });
    await writeFile(
      configPath(userData),
      JSON.stringify({
        ...defaultAppConfig(),
        theme: {
          preference: "dark",
        },
      }),
      "utf8",
    );

    const recovered = await runConfig(
      userData,
      Effect.gen(function* () {
        const appConfig = yield* AppConfig;
        return yield* appConfig.read;
      }),
    );

    assert.equal(recovered.theme.preference, "dark");
    assert.equal(recovered.theme.density, "compact");
  });

  it("persists repository add, dedupe, mark opened, and removal", async () => {
    const userData = await makeTempDir();
    const repositoryPath = join(userData, "project");
    await mkdir(repositoryPath);
    await execFileAsync("git", ["init"], { cwd: repositoryPath });

    const result = await runServices(
      userData,
      Effect.gen(function* () {
        const workspace = yield* LocalWorkspace;
        const first = yield* workspace.upsertRepositoryPath({ path: repositoryPath });
        const second = yield* workspace.upsertRepositoryPath({
          displayName: "Renamed project",
          path: repositoryPath,
        });
        const collapsed = yield* workspace.updateRepositoryPreferences({
          id: first.id,
          preferences: {
            sidebarExpanded: false,
          },
        });
        yield* workspace.updatePreferences({ sidebarCollapsed: true });
        const opened = yield* workspace.markRepositoryOpened(first.id);
        const beforeRemoval = yield* workspace.listRepositories;
        const afterRemoval = yield* workspace.removeRepository(first.id);
        return { afterRemoval, beforeRemoval, collapsed, first, opened, second };
      }),
    );

    assert.equal(result.first.id, result.second.id);
    const rootCommit = await readCycleRootCommit(repositoryPath);
    assert.equal(result.first.id, repositoryIdForCycleRoot(rootCommit));
    assert.equal(result.first.gitDbRootCommitId, rootCommit);
    assert.equal(result.first.preferences.autoSync, true);
    assert.equal(result.first.preferences.commitStyle, "descriptive");
    assert.equal(result.first.preferences.sidebarExpanded, true);
    assert.equal(result.second.displayName, "Renamed project");
    assert.equal(result.collapsed?.preferences.sidebarExpanded, false);
    assert.equal(result.opened?.id, result.first.id);
    assert.equal(result.opened?.preferences.sidebarExpanded, false);
    assert.equal(result.beforeRemoval.length, 1);
    assert.equal(result.beforeRemoval[0]?.lastOpenedAt !== undefined, true);
    assert.equal(result.beforeRemoval[0]?.preferences.sidebarExpanded, false);
    assert.equal(result.afterRemoval.length, 0);
    const config = await runConfig(
      userData,
      Effect.gen(function* () {
        const appConfig = yield* AppConfig;
        return yield* appConfig.read;
      }),
    );

    assert.equal(config.localWorkspace.repositories.length, 0);
    assert.equal(config.localWorkspace.sidebarCollapsed, true);
  });

  it("reuses an existing local repository identity without probing an unavailable remote", async () => {
    const userData = await makeTempDir();
    const repositoryPath = join(userData, "project");
    await mkdir(repositoryPath);
    await execFileAsync("git", ["init"], { cwd: repositoryPath });

    const result = await runServices(
      userData,
      Effect.gen(function* () {
        const workspace = yield* LocalWorkspace;
        const first = yield* workspace.upsertRepositoryPath({ path: repositoryPath });

        yield* Effect.tryPromise(() =>
          execFileAsync("git", ["remote", "add", "origin", join(userData, "missing.git")], {
            cwd: repositoryPath,
          }),
        );

        const second = yield* workspace.upsertRepositoryPath({ path: repositoryPath });

        return { first, second };
      }),
    );

    assert.equal(result.second.id, result.first.id);
    assert.equal(result.second.gitDbRootCommitId, result.first.gitDbRootCommitId);
  });

  it("rejects repositories that are not git initialised", async () => {
    const userData = await makeTempDir();
    const repositoryPath = join(userData, "project");
    await mkdir(repositoryPath);

    await assert.rejects(() =>
      runServices(
        userData,
        Effect.gen(function* () {
          const workspace = yield* LocalWorkspace;
          return yield* workspace.upsertRepositoryPath({ path: repositoryPath });
        }),
      ),
    );

    const config = await runConfig(
      userData,
      Effect.gen(function* () {
        const appConfig = yield* AppConfig;
        return yield* appConfig.read;
      }),
    );

    assert.equal(config.localWorkspace.repositories.length, 0);
  });

  it("initialises a missing git repository before adding it", async () => {
    const userData = await makeTempDir();
    const repositoryPath = join(userData, "project");
    await mkdir(repositoryPath);

    const repository = await runServices(
      userData,
      Effect.gen(function* () {
        const workspace = yield* LocalWorkspace;
        return yield* workspace.initializeRepositoryPath({ path: repositoryPath });
      }),
    );

    const gitEntry = await stat(join(repositoryPath, ".git"));
    const config = await runConfig(
      userData,
      Effect.gen(function* () {
        const appConfig = yield* AppConfig;
        return yield* appConfig.read;
      }),
    );

    assert.equal(gitEntry.isDirectory(), true);
    const rootCommit = await readCycleRootCommit(repositoryPath);
    assert.equal(repository.path, repositoryPath);
    assert.equal(repository.id, repositoryIdForCycleRoot(rootCommit));
    assert.equal(repository.gitDbRootCommitId, rootCommit);
    assert.equal(config.localWorkspace.repositories[0]?.id, repository.id);
  });

  it("fails invalid JSON without replacing the file", async () => {
    const userData = await makeTempDir();
    await mkdir(configDirectory(userData), { recursive: true });
    await writeFile(configPath(userData), "{ nope", "utf8");

    await assert.rejects(() =>
      runConfig(
        userData,
        Effect.gen(function* () {
          const appConfig = yield* AppConfig;
          return yield* appConfig.read;
        }),
      ),
    );

    assert.equal(await readFile(configPath(userData), "utf8"), "{ nope");
  });

  it("fails partially invalid config without salvaging sections", async () => {
    const userData = await makeTempDir();
    await mkdir(configDirectory(userData), { recursive: true });
    await writeFile(
      configPath(userData),
      JSON.stringify({
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
        userData,
        Effect.gen(function* () {
          const appConfig = yield* AppConfig;
          return yield* appConfig.read;
        }),
      ),
    );
  });

  it("detects providers from PATH without enabling app config preferences", async () => {
    const userData = await makeTempDir();
    const bin = join(userData, "bin");
    await mkdir(bin);
    const codex = join(bin, "codex");
    await writeFile(codex, "#!/bin/sh\nexit 0\n", "utf8");
    await chmod(codex, 0o755);

    await runConfig(
      userData,
      Effect.gen(function* () {
        const appConfig = yield* AppConfig;
        return yield* appConfig.read;
      }),
    );

    const providers = await Effect.runPromise(
      detectAgentProviders({ PATH: bin }, { hydrate: false }),
    );
    const persisted = await readPersistedConfig(userData);

    assert.equal(providers.find((provider) => provider.id === "codex")?.status, "available");
    assert.deepEqual(persisted.agentProviders.preferences, []);
  });

  it("detects providers exposed by the user shell when PATH is sparse", async () => {
    const userData = await makeTempDir();
    const bin = join(userData, "bin");
    await mkdir(bin);
    const codex = join(bin, "codex");
    const shell = join(userData, "shell");
    await writeFile(codex, "#!/bin/sh\nexit 0\n", "utf8");
    await writeFile(
      shell,
      [
        "#!/bin/sh",
        `PATH="${bin}:/usr/bin:/bin:$PATH"`,
        'if [ "$1" = "-ilc" ]; then',
        "  shift",
        '  exec /bin/sh -c "$1"',
        "fi",
        'exec /bin/sh "$@"',
        "",
      ].join("\n"),
      "utf8",
    );
    await chmod(codex, 0o755);
    await chmod(shell, 0o755);

    const providers = await Effect.runPromise(detectAgentProviders({ PATH: "", SHELL: shell }));

    assert.equal(providers.find((provider) => provider.id === "codex")?.status, "available");
    assert.equal(providers.find((provider) => provider.id === "codex")?.executablePath, codex);
  });
});
