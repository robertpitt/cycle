import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { defaultLayer } from "../src/index.ts";

const makeLayer = (directory: string, maxBytes = 10 * 1024 * 1024) =>
  defaultLayer({
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

const emitLog = (
  directory: string,
  message: string,
  fields: Readonly<Record<string, unknown>> = {},
  maxBytes?: number,
) =>
  Effect.scoped(
    Effect.logInfo(message).pipe(
      Effect.annotateLogs({
        service: "api",
        ...fields,
      }),
      Effect.provide(makeLayer(directory, maxBytes)),
    ),
  );

describe("@cycle/logging", () => {
  it("writes redacted JSONL entries to the shared cycle log", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cycle-logging-"));
    await Effect.runPromise(
      emitLog(directory, "request completed token=abc", {
        authorization: "Bearer abc",
        url: "https://user:pass@example.com/path",
      }),
    );

    const text = await readFile(join(directory, "cycle.jsonl"), "utf8");
    const entry = JSON.parse(text.trim()) as Record<string, unknown>;

    expect(entry.service).toBe("api");
    expect(entry).not.toHaveProperty("package");
    expect(JSON.stringify(entry)).not.toContain("Bearer abc");
    expect(JSON.stringify(entry)).not.toContain("user:pass");
    expect(JSON.stringify(entry)).toContain("<redacted>");
  });

  it("rotates the shared cycle log", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cycle-logging-"));
    await Effect.runPromise(emitLog(directory, "x".repeat(160), {}, 120));
    await Effect.runPromise(emitLog(directory, "second", {}, 120));

    const active = await readFile(join(directory, "cycle.jsonl"), "utf8");
    const rotated = await readFile(join(directory, "cycle.1.jsonl"), "utf8");

    expect(active).toContain("second");
    expect(rotated).toContain("x".repeat(160));
  });
});
