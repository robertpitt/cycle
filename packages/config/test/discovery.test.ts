import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { NodeServices } from "@effect/platform-node";
import { Crypto, Effect, FileSystem, Path } from "effect";
import { afterEach, describe, it } from "vitest";
import { defaultAppConfig } from "../src/AppConfig.ts";
import { discoverCycleApiEffect } from "../src/CycleApiDiscovery.ts";
import type { CycleApiDiscoveryError } from "../src/CycleApiDiscovery.ts";

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

const runtimePath = (directory: string): string =>
  join(directory, `cycle-api-${globalThis.process?.getuid?.() ?? "user"}.json`);

describe("@cycle/config CycleApiDiscovery", () => {
  it("prefers explicit URL and token and normalizes trailing slashes", async () => {
    const result = await runPlatform(
      discoverCycleApiEffect({
        apiToken: "explicit-token",
        apiUrl: "http://127.0.0.1:9999///",
        env: {
          CYCLE_API_TOKEN: "env-token",
          CYCLE_API_URL: "http://127.0.0.1:1111",
        },
      }),
    );

    assert.deepEqual(result, {
      baseUrl: "http://127.0.0.1:9999",
      token: "explicit-token",
    });
  });

  it("uses environment URL and token when explicit values are absent", async () => {
    const result = await runPlatform(
      discoverCycleApiEffect({
        env: {
          CYCLE_API_TOKEN: "env-token",
          CYCLE_API_URL: "http://127.0.0.1:2222/",
        },
      }),
    );

    assert.deepEqual(result, {
      baseUrl: "http://127.0.0.1:2222",
      token: "env-token",
    });
  });

  it("uses app config token with runtime discovery base URL", async () => {
    const directory = await makeTempDir();
    const env = {
      HOME: directory,
      TMPDIR: directory,
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
      discoverCycleApiEffect({
        env,
      }),
    );

    assert.deepEqual(result, {
      baseUrl: "http://127.0.0.1:3333",
      token: "app-config-token",
    });
  });

  it("falls back to default URL when only a token is available", async () => {
    const result = await runPlatform(
      discoverCycleApiEffect({
        env: {
          CYCLE_API_TOKEN: "token-only",
          CYCLE_API_URL_DEFAULT: "http://localhost:4444/",
        },
      }),
    );

    assert.deepEqual(result, {
      baseUrl: "http://localhost:4444",
      token: "token-only",
    });
  });

  it("ignores invalid runtime discovery files for tolerant reads", async () => {
    const directory = await makeTempDir();
    const env = {
      CYCLE_API_TOKEN: "token",
      HOME: directory,
      TMPDIR: directory,
    };
    const discoveryPath = runtimePath(directory);

    await writeFile(discoveryPath, "{ nope", "utf8");

    const discovered = await runPlatform(discoverCycleApiEffect({ env }));

    assert.deepEqual(discovered, {
      baseUrl: "http://127.0.0.1:4738",
      token: "token",
    });
  });

  it("creates a canonical app config token when no token override exists", async () => {
    const directory = await makeTempDir();
    const result = await runPlatform(
      discoverCycleApiEffect({
        env: {
          HOME: directory,
        },
      }),
    );

    assert.equal(result.baseUrl, "http://127.0.0.1:4738");
    assert.match(result.token, /^[A-Za-z0-9_-]{43}$/u);
  });

  it("returns typed unavailable errors when canonical app config cannot be read", async () => {
    const directory = await makeTempDir();
    const notDirectory = join(directory, "not-a-directory");
    await writeFile(notDirectory, "blocking file", "utf8");

    const error = await runPlatform(
      discoverCycleApiEffect({
        env: {
          HOME: notDirectory,
        },
      }).pipe(Effect.flip),
    );

    assert.deepEqual(error satisfies CycleApiDiscoveryError, {
      _tag: "CycleApiDiscoveryError",
      code: "API_UNAVAILABLE",
      message: "No Cycle API URL/token was supplied and no local app config token was found.",
    });
  });
});
