import { strict as assert } from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "vitest";

const packageRoot = resolve(import.meta.dirname, "..");
const srcRoot = resolve(packageRoot, "src");

const productionFiles = (directory: string): ReadonlyArray<string> => {
  const entries = readdirSync(directory);
  const files: Array<string> = [];

  for (const entry of entries) {
    const absolute = resolve(directory, entry);
    const stat = statSync(absolute);

    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === "test" || entry === "testing") continue;
      files.push(...productionFiles(absolute));
      continue;
    }

    if (entry.endsWith(".ts")) files.push(absolute);
  }

  return files;
};

describe("database SQL boundaries", () => {
  it("does not use synchronous SQLite or prepared-statement wrappers in production code", () => {
    const offenders = productionFiles(srcRoot).filter((file) => {
      const text = readFileSync(file, "utf8");
      return (
        text.includes("@cycle/sqlite/sync") ||
        text.includes("node:sqlite") ||
        text.includes(".prepare(") ||
        text.includes("prepare(")
      );
    });

    assert.deepEqual(
      offenders.map((file) => file.slice(packageRoot.length + 1)),
      [],
    );
  });

  it("does not export database path discovery from the public root", () => {
    const text = readFileSync(resolve(srcRoot, "index.ts"), "utf8");

    assert.equal(text.includes("./paths"), false);
  });
});
