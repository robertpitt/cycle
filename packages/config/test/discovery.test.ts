import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { NodeServices } from "@effect/platform-node";
import { ConfigProvider, Crypto, Effect, FileSystem, Layer, Path } from "effect";
import { afterEach, describe, it } from "vitest";
import {
  AppConfigLive,
  cycleApiConnectionToken,
  defaultAppConfig,
  envProvider,
  resolveCycleApiConnection,
  RuntimeDiscoveryLive,
  type ConfigSourceEnv,
  type CycleApiConnectionError,
  type CycleApiConnectionInput,
} from "@cycle/config";

const temporaryDirectories: Array<string> = [];

const makeTempDir = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), "cycle-discovery-"));
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

const runPlatform = <A, E>(
  effect: Effect.Effect<A, E, Crypto.Crypto | FileSystem.FileSystem | Path.Path>,
) => Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)));

const runtimePath = (directory: string): string => join(directory, "cycle-api-test-user.json");

const connectionLayer = Layer.merge(AppConfigLive, RuntimeDiscoveryLive);

const resolveConnection = (
  input: CycleApiConnectionInput & { readonly env?: ConfigSourceEnv } = {},
) => {
  const effect = resolveCycleApiConnection({
    apiToken: input.apiToken,
    apiUrl: input.apiUrl,
  }).pipe(Effect.provide(connectionLayer));
  return input.env === undefined
    ? effect
    : effect.pipe(Effect.provideService(ConfigProvider.ConfigProvider, envProvider(input.env)));
};

describe("@cycle/config CycleApiConnection", () => {
  it("prefers explicit URL and token and normalizes trailing slashes", async () => {
    const result = await runPlatform(
      resolveConnection({
        apiToken: "explicit-token",
        apiUrl: "http://127.0.0.1:9999///",
        env: {
          CYCLE_API_TOKEN: "env-token",
          CYCLE_API_URL: "http://127.0.0.1:1111",
        },
      }),
    );

    assert.equal(result.baseUrl, "http://127.0.0.1:9999");
    assert.equal(cycleApiConnectionToken(result), "explicit-token");
    assert.deepEqual(result.source, {
      baseUrl: "explicit",
      token: "explicit",
    });
  });

  it("uses environment URL and token when explicit values are absent", async () => {
    const result = await runPlatform(
      resolveConnection({
        env: {
          CYCLE_API_TOKEN: "env-token",
          CYCLE_API_URL: "http://127.0.0.1:2222/",
        },
      }),
    );

    assert.equal(result.baseUrl, "http://127.0.0.1:2222");
    assert.equal(cycleApiConnectionToken(result), "env-token");
    assert.deepEqual(result.source, {
      baseUrl: "env",
      token: "env",
    });
  });

  it("uses app config token with runtime discovery base URL", async () => {
    const directory = await makeTempDir();
    const env = {
      HOME: directory,
      TMPDIR: directory,
      USER: "test-user",
    };
    const discoveryPath = runtimePath(directory);

    await mkdir(dirname(discoveryPath), { recursive: true });
    await writeFile(
      discoveryPath,
      JSON.stringify({
        baseUrl: "http://127.0.0.1:3333/",
        pid: 123,
      }),
      "utf8",
    );
    const configPath = join(directory, ".cycle", "app-config.json");
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(
      configPath,
      `${JSON.stringify(
        {
          ...defaultAppConfig(),
          api: {
            ...defaultAppConfig().api,
            staticToken: "app-config-token",
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const result = await runPlatform(
      resolveConnection({
        env,
      }),
    );

    assert.equal(result.baseUrl, "http://127.0.0.1:3333");
    assert.equal(cycleApiConnectionToken(result), "app-config-token");
    assert.deepEqual(result.source, {
      baseUrl: "runtimeDiscovery",
      token: "appConfig",
    });
  });

  it("falls back to default URL when only a token is available", async () => {
    const result = await runPlatform(
      resolveConnection({
        env: {
          CYCLE_API_TOKEN: "token-only",
          CYCLE_API_URL_DEFAULT: "http://localhost:4444/",
        },
      }),
    );

    assert.equal(result.baseUrl, "http://localhost:4444");
    assert.equal(cycleApiConnectionToken(result), "token-only");
    assert.deepEqual(result.source, {
      baseUrl: "env",
      token: "env",
    });
  });

  it("fails visibly for invalid runtime discovery files", async () => {
    const directory = await makeTempDir();
    const env = {
      CYCLE_API_TOKEN: "token",
      HOME: directory,
      TMPDIR: directory,
      USER: "test-user",
    };
    const discoveryPath = runtimePath(directory);

    await writeFile(discoveryPath, "{ nope", "utf8");

    const error = await runPlatform(resolveConnection({ env }).pipe(Effect.flip));

    assert.equal(error.code, "DISCOVERY_INVALID");
  });

  it("honors an explicit runtime discovery path", async () => {
    const directory = await makeTempDir();
    const discoveryPath = join(directory, "custom-runtime.json");
    await writeFile(discoveryPath, JSON.stringify({ baseUrl: "http://127.0.0.1:5555" }), "utf8");

    const result = await runPlatform(
      resolveConnection({
        env: {
          CYCLE_API_RUNTIME_FILE: discoveryPath,
          CYCLE_API_TOKEN: "token",
          HOME: directory,
        },
      }),
    );

    assert.equal(result.baseUrl, "http://127.0.0.1:5555");
    assert.equal(result.source.baseUrl, "runtimeDiscovery");
  });

  it("rejects invalid explicit URLs", async () => {
    const error = await runPlatform(
      resolveConnection({ apiToken: "token", apiUrl: "not-a-url" }).pipe(Effect.flip),
    );

    assert.equal(error.code, "INVALID_API_URL");
  });

  it("creates a canonical app config token when no token override exists", async () => {
    const directory = await makeTempDir();
    const result = await runPlatform(
      resolveConnection({
        env: {
          HOME: directory,
        },
      }),
    );

    assert.equal(result.baseUrl, "http://127.0.0.1:4738");
    assert.match(cycleApiConnectionToken(result), /^[A-Za-z0-9_-]{43}$/u);
  });

  it("returns typed unavailable errors when canonical app config cannot be read", async () => {
    const directory = await makeTempDir();
    const notDirectory = join(directory, "not-a-directory");
    await writeFile(notDirectory, "blocking file", "utf8");

    const error = await runPlatform(
      resolveConnection({
        env: {
          HOME: notDirectory,
        },
      }).pipe(Effect.flip),
    );

    assert.equal(error._tag, "CycleApiConnectionError");
    const connectionError = error as CycleApiConnectionError;
    assert.equal(connectionError.code, "API_UNAVAILABLE");
    assert.equal(
      connectionError.message,
      "No Cycle API URL/token was supplied and no local app config token was found.",
    );
  });
});
