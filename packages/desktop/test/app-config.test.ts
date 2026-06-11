import { strict as assert } from "node:assert";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { Effect, Layer } from "effect";
import { GitRepositoryLive } from "@cycle/git";
import { afterEach, describe, it } from "vitest";
import { ElectronApp } from "../src/platform/ElectronApp.ts";
import {
  AppConfig,
  defaultAppConfig,
  parseAppConfig,
  type AppConfigState,
} from "../src/shared/AppConfig.ts";
import { LocalWorkspace } from "../src/shared/LocalWorkspace.ts";
import { Profile } from "../src/shared/Profile.ts";
import { detectAgentProviders } from "../src/main/AgentProviderDetectorLive.ts";
import { AppConfigLive } from "../src/main/AppConfigLive.ts";
import { LocalWorkspaceLive } from "../src/main/LocalWorkspaceLive.ts";
import { ProfileLive } from "../src/main/ProfileLive.ts";

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

const makeElectronAppTest = (userData: string) =>
  Layer.succeed(ElectronApp)({
    appPath: Effect.succeed(userData),
    awaitShutdown: Effect.void,
    getPath: (name) => Effect.succeed(name === "userData" ? userData : tmpdir()),
    platform: process.platform,
    quit: () => Effect.void,
    startLifecycleSupervision: () => Effect.void,
    whenReady: () => Effect.void,
  });

const makeConfigLayer = (userData: string) =>
  AppConfigLive.pipe(Layer.provide(makeElectronAppTest(userData)));

const makeServicesLayer = (userData: string) => {
  const appConfig = makeConfigLayer(userData);
  const gitRepository = GitRepositoryLive.NodeLive;
  return Layer.mergeAll(
    appConfig,
    ProfileLive.pipe(Layer.provide(appConfig)),
    gitRepository,
    LocalWorkspaceLive.pipe(Layer.provide(Layer.mergeAll(appConfig, gitRepository))),
  );
};

const runConfig = <A>(userData: string, effect: Effect.Effect<A, unknown, AppConfig>) =>
  Effect.runPromise(effect.pipe(Effect.provide(makeConfigLayer(userData))));

const runServices = <A>(
  userData: string,
  effect: Effect.Effect<A, unknown, AppConfig | Profile | LocalWorkspace>,
) => Effect.runPromise(effect.pipe(Effect.provide(makeServicesLayer(userData))));

const configPath = (userData: string): string => join(userData, "app-config.json");

const readPersistedConfig = async (userData: string): Promise<AppConfigState> =>
  JSON.parse(await readFile(configPath(userData), "utf8")) as AppConfigState;

describe("desktop app config", () => {
  it("validates app config through Effect Config and ConfigProvider", async () => {
    const valid = await Effect.runPromise(parseAppConfig(defaultAppConfig()));
    assert.equal(valid.schemaVersion, 1);

    await assert.rejects(() =>
      Effect.runPromise(
        parseAppConfig({
          ...defaultAppConfig(),
          theme: {
            preference: "sepia",
          },
        }),
      ),
    );
  });

  it("creates default config on first run", async () => {
    const userData = await makeTempDir();
    const config = await runConfig(
      userData,
      Effect.gen(function* () {
        const appConfig = yield* AppConfig;
        return yield* appConfig.read();
      }),
    );

    assert.deepEqual(config, defaultAppConfig());
    assert.deepEqual(await readPersistedConfig(userData), defaultAppConfig());
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
        const updated = yield* profile.getProfile();
        const completed = yield* profile.completeOnboarding({
          displayName: "Robert",
          email: "robert@example.com",
          enabledAgentProviderIds: ["codex", "opencode"],
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
        enabled: true,
        id: "codex",
      },
      {
        enabled: false,
        id: "claude",
      },
      {
        enabled: true,
        id: "opencode",
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
        yield* appConfig.setThemePreference("light");
      }),
    );

    assert.equal((await readPersistedConfig(userData)).theme.preference, "light");

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

    const recovered = await runConfig(
      userData,
      Effect.gen(function* () {
        const appConfig = yield* AppConfig;
        return yield* appConfig.read();
      }),
    );

    assert.equal(recovered.theme.preference, "system");
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
        const opened = yield* workspace.markRepositoryOpened(first.id);
        const beforeRemoval = yield* workspace.listRepositories();
        const afterRemoval = yield* workspace.removeRepository(first.id);
        return { afterRemoval, beforeRemoval, collapsed, first, opened, second };
      }),
    );

    assert.equal(result.first.id, result.second.id);
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
        return yield* appConfig.read();
      }),
    );

    assert.equal(config.localWorkspace.repositories.length, 0);
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
        return yield* appConfig.read();
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
        return yield* appConfig.read();
      }),
    );

    assert.equal(gitEntry.isDirectory(), true);
    assert.equal(repository.path, repositoryPath);
    assert.equal(config.localWorkspace.repositories[0]?.id, repository.id);
  });

  it("backs up invalid JSON and writes defaults", async () => {
    const userData = await makeTempDir();
    await writeFile(configPath(userData), "{ nope", "utf8");

    const recovered = await runConfig(
      userData,
      Effect.gen(function* () {
        const appConfig = yield* AppConfig;
        return yield* appConfig.read();
      }),
    );

    const files = await readdir(userData);
    assert.deepEqual(recovered, defaultAppConfig());
    assert.equal(
      files.some((file) => file.startsWith("app-config.invalid-")),
      true,
    );
    assert.deepEqual(await readPersistedConfig(userData), defaultAppConfig());
  });

  it("salvages valid sections from partially invalid config", async () => {
    const userData = await makeTempDir();
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

    const recovered = await runConfig(
      userData,
      Effect.gen(function* () {
        const appConfig = yield* AppConfig;
        return yield* appConfig.read();
      }),
    );

    assert.equal(recovered.profile.displayName, "Robert");
    assert.equal(recovered.onboarding.completed, true);
    assert.equal(recovered.theme.preference, "system");
    assert.equal(recovered.localWorkspace.repositories.length, 1);
    assert.equal(recovered.localWorkspace.repositories[0]?.id, "repo_1");
    assert.equal(recovered.localWorkspace.repositories[0]?.preferences.sidebarExpanded, true);
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
        return yield* appConfig.read();
      }),
    );

    const providers = await Effect.runPromise(detectAgentProviders({ PATH: bin }));
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
    await writeFile(shell, `#!/bin/sh\nPATH="${bin}:$PATH"\nexec /bin/sh "$@"\n`, "utf8");
    await chmod(codex, 0o755);
    await chmod(shell, 0o755);

    const providers = await Effect.runPromise(detectAgentProviders({ PATH: "", SHELL: shell }));

    assert.equal(providers.find((provider) => provider.id === "codex")?.status, "available");
    assert.equal(providers.find((provider) => provider.id === "codex")?.executablePath, codex);
  });
});
