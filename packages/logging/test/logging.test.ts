import {
  CycleLoggingLive,
  cycleLogConfig,
  normalizePackageName,
  normalizeService,
} from "../src/index.ts";
import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect, Exit, FileSystem, Path } from "effect";

const makeLayer = (directory: string, maxBytes = 10 * 1024 * 1024) =>
  CycleLoggingLive({
    batchWindowMs: 1,
    console: false,
    file: {
      directory,
      filename: "cycle.jsonl",
    },
    rotation: {
      maxBytes,
      maxFiles: 2,
    },
  });

const emitLog = Effect.fn("emitLog")(function* (
  directory: string,
  message: string,
  fields: Readonly<Record<string, unknown>> = {},
  maxBytes?: number,
) {
  return yield* Effect.logInfo(message).pipe(
    Effect.annotateLogs({
      service: "api",
      ...fields,
    }),
    Effect.provide(makeLayer(directory, maxBytes)),
  );
});

describe("@cycle/logging", () => {
  it.effect("writes redacted JSONL entries to the shared cycle log", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "cycle-logging-" });

      yield* emitLog(directory, "request completed token=abc", {
        authorization: "Bearer abc",
        nested: [{ password: "array-secret" }],
        url: "https://user:pass@example.com/path",
      });

      const text = yield* fileSystem.readFileString(path.join(directory, "cycle.jsonl"));
      const entry = JSON.parse(text.trim()) as Record<string, unknown>;

      expect(entry.service).toBe("@cycle/api");
      expect(entry).not.toHaveProperty("package");
      expect(JSON.stringify(entry)).not.toContain("array-secret");
      expect(JSON.stringify(entry)).not.toContain("Bearer abc");
      expect(JSON.stringify(entry)).not.toContain("user:pass");
      expect(JSON.stringify(entry)).toContain("<redacted>");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("rotates the shared cycle log", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "cycle-logging-" });

      yield* emitLog(directory, "x".repeat(160), {}, 120);
      yield* emitLog(directory, "second", {}, 120);

      const active = yield* fileSystem.readFileString(path.join(directory, "cycle.jsonl"));
      const rotated = yield* fileSystem.readFileString(path.join(directory, "cycle.1.jsonl"));

      expect(active).toContain("second");
      expect(rotated).toContain("x".repeat(160));
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("normalizes package service names for OTLP resources", () =>
    Effect.gen(function* () {
      expect(normalizePackageName("@cycle/git-store")).toBe("git-store");
      expect(normalizePackageName("cycle.git_store")).toBe("git-store");
      expect(normalizeService("api")).toBe("@cycle/api");
      expect(normalizeService("@cycle/usecases")).toBe("@cycle/usecases");

      const config = yield* cycleLogConfig({ packageName: "api" }).parse(
        ConfigProvider.fromUnknown({}),
      );

      expect(config.packageName).toBe("api");
      expect(config.otlp.serviceName).toBe("@cycle/api");
    }),
  );

  it.effect("normalizes explicit OTLP service overrides", () =>
    Effect.gen(function* () {
      const config = yield* cycleLogConfig().parse(
        ConfigProvider.fromUnknown({
          CYCLE_OTLP_SERVICE_NAME: "desktop",
          OTEL_SERVICE_NAME: "ignored",
        }),
      );

      expect(config.otlp.serviceName).toBe("@cycle/desktop");
    }),
  );

  it.effect("rejects invalid positive integer configuration", () =>
    Effect.gen(function* () {
      const exit = yield* cycleLogConfig()
        .parse(ConfigProvider.fromUnknown({ CYCLE_LOG_MAX_FILES: "0" }))
        .pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBe(true);
    }),
  );
});
