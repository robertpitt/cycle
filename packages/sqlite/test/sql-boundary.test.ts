import { strict as assert } from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../../..");
const packagesRoot = resolve(repoRoot, "packages");

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

describe("SQL package boundaries", () => {
  it("keeps synchronous SQLite isolated to the deprecated compatibility module", () => {
    const offenders = productionFiles(packagesRoot).filter((file) => {
      const text = readFileSync(file, "utf8");
      if (file.endsWith("packages/sqlite/src/sync.ts")) return false;
      return text.includes("@cycle/sqlite/sync") || text.includes("node:sqlite");
    });

    assert.deepEqual(
      offenders.map((file) => file.slice(repoRoot.length + 1)),
      [],
    );
  });

  it("does not expose sync or internal helpers from the sqlite root barrel", () => {
    const text = readFileSync(resolve(repoRoot, "packages/sqlite/src/index.ts"), "utf8");

    assert.equal(text.includes("./sync"), false);
    assert.equal(text.includes("./internals"), false);
  });
});
