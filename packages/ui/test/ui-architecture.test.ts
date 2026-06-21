import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  componentActionVariants,
  componentAppearances,
  componentDensities,
  componentSizes,
  componentTones,
} from "../src/lib/contracts.ts";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const srcRoot = join(packageRoot, "src");

const sourceExtensions = [".ts", ".tsx"] as const;
const atomicGroups = ["atoms", "molecules", "organisms"] as const;
const forbiddenRuntimePackages = [
  "@cycle/contracts",
  "@cycle/database",
  "@cycle/desktop",
  "@cycle/git",
  "@cycle/git-db",
  "@cycle/usecases",
  "@tanstack/react-query",
  "effect",
  "electron",
  "react-router",
] as const;

describe("@cycle/ui architecture", () => {
  it("keeps runtime and app package imports out of source files", async () => {
    const files = await collectFiles(srcRoot);
    const implementationFiles = files.filter(
      (file) =>
        sourceExtensions.some((extension) => file.endsWith(extension)) &&
        !file.endsWith(".stories.tsx"),
    );

    const violations: Array<string> = [];
    for (const file of implementationFiles) {
      const source = await readFile(file, "utf8");
      const lines = source.split("\n");

      lines.forEach((line, index) => {
        const imported = findForbiddenImport(line);
        if (imported) {
          violations.push(`${relative(packageRoot, file)}:${index + 1} imports ${imported}`);
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it("keeps runtime packages out of production dependencies", async () => {
    const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const productionDependencies = {
      ...packageJson.dependencies,
      ...packageJson.optionalDependencies,
      ...packageJson.peerDependencies,
    };

    const violations = Object.keys(productionDependencies).filter((dependency) =>
      forbiddenRuntimePackages.some(
        (forbidden) => dependency === forbidden || dependency.startsWith(`${forbidden}/`),
      ),
    );

    expect(violations).toEqual([]);
  });

  it("keeps the root barrel as the only broad component import surface", async () => {
    const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as {
      exports?: Record<string, string>;
    };
    const exportKeys = Object.keys(packageJson.exports ?? {});

    expect(
      exportKeys.filter((key) => key === "./components" || key.startsWith("./components/")),
    ).toEqual([]);
    await expect(readdir(join(srcRoot, "components"))).rejects.toThrow();

    const rootIndex = await readFile(join(srcRoot, "index.ts"), "utf8");
    expect(rootIndex).toContain('export * from "./atoms/index.ts";');
    expect(rootIndex).toContain('export * from "./molecules/index.ts";');
    expect(rootIndex).toContain('export * from "./organisms/index.ts";');
  });

  it("maintains Storybook coverage for public components", async () => {
    const missingStories: Array<string> = [];

    for (const group of atomicGroups) {
      const directories = await readComponentDirectories(join(srcRoot, group));

      for (const directory of directories) {
        const stories = await collectFiles(directory);
        if (!stories.some((file) => file.endsWith(".stories.tsx"))) {
          missingStories.push(relative(srcRoot, directory));
        }
      }
    }

    expect(missingStories).toEqual([]);
  });

  it("centralizes reusable semantic API vocabulary", () => {
    expect(componentTones).toEqual(["neutral", "info", "success", "warning", "danger", "accent"]);
    expect(componentDensities).toEqual(["compact", "comfortable"]);
    expect(componentSizes).toEqual(["sm", "md", "lg"]);
    expect(componentAppearances).toEqual(["soft", "solid", "outline"]);
    expect(componentActionVariants).toEqual(["primary", "secondary", "outline", "ghost", "link"]);
  });
});

const collectFiles = async (directory: string): Promise<Array<string>> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? collectFiles(path) : [path];
    }),
  );

  return files.flat();
};

const readComponentDirectories = async (directory: string): Promise<Array<string>> => {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => join(directory, entry.name));
};

const findForbiddenImport = (line: string): string | undefined => {
  const importMatch = line.match(/(?:from\s+|import\s*\(\s*)["']([^"']+)["']/u);
  const specifier = importMatch?.[1];
  if (!specifier) {
    return undefined;
  }

  return forbiddenRuntimePackages.find(
    (forbidden) => specifier === forbidden || specifier.startsWith(`${forbidden}/`),
  );
};
