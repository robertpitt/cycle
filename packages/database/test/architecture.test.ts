import { describe, it } from "@effect/vitest";
import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");

const sourceFiles = (directory: string): ReadonlyArray<string> =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".ts") ? [entryPath] : [];
  });

const forbiddenPatterns: ReadonlyArray<readonly [label: string, pattern: RegExp]> = [
  ["Effect runtime execution", /\bEffect\.run[A-Z]\w*\s*\(/g],
  ["manual Scope construction or closure", /\bScope\.(?:make|close)\s*\(/g],
  ["local Layer construction", /\bLayer\.(?:build|buildWithScope)\s*\(/g],
  [
    "synchronous Schema decoding or encoding",
    /\bSchema\.(?:decodeUnknownSync|encodeUnknownSync)\b/g,
  ],
  ["synchronous SQLite adapter import", /["'](?:@cycle\/sqlite\/sync|node:sqlite)["']/g],
  ["synchronous prepared statement", /\.(?:prepare)\s*\(/g],
  ["legacy synchronous Projection construction", /\bnew\s+Projection\s*\(/g],
  ["direct Date.now current-time read", /\bDate\.now\s*\(/g],
  ["zero-argument Date current-time read", /\bnew\s+Date\s*\(\s*\)/g],
  ["direct performance.now elapsed-time read", /\bperformance\.now\s*\(/g],
];

describe("@cycle/database architecture", () => {
  it("keeps runtime, scope, schema, SQLite, and clock boundaries Effect-native", () => {
    const violations: Array<string> = [];

    for (const file of sourceFiles(sourceRoot)) {
      const source = readFileSync(file, "utf8");
      for (const [label, pattern] of forbiddenPatterns) {
        pattern.lastIndex = 0;
        if (pattern.test(source)) {
          violations.push(`${path.relative(sourceRoot, file)}: ${label}`);
        }
      }
    }

    assert.deepEqual(violations, []);
  });
});
