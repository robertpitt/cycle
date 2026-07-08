import { strict as assert } from "node:assert";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "vitest";

const rendererRoot = join(process.cwd(), "src", "renderer");
const sourceExtensions = new Set([".ts", ".tsx"]);
const forbiddenPackagePattern =
  /from\s+["'](@cycle\/(?:backend|config|agents|git|database|sqlite)(?:\/[^"']*)?|@effect\/platform-node|node:[^"']+|electron)["']/u;

const walk = async (directory: string): Promise<readonly string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return walk(path);
      if (!entry.isFile()) return [];
      const extension = entry.name.slice(entry.name.lastIndexOf("."));
      return sourceExtensions.has(extension) ? [path] : [];
    }),
  );

  return files.flat();
};

describe("renderer package boundary", () => {
  it("imports only browser-safe package surfaces", async () => {
    const violations: string[] = [];

    for (const file of await walk(rendererRoot)) {
      const source = await readFile(file, "utf8");
      for (const [index, line] of source.split("\n").entries()) {
        const match = forbiddenPackagePattern.exec(line);
        if (match === null) continue;
        violations.push(`${file}:${index + 1}: ${match[1]}`);
      }
    }

    assert.deepEqual(violations, []);
  });
});
