import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { arch, platform } from "node:os";
import { resolve } from "node:path";
import * as Effect from "effect/Effect";
import {
  SqliteVectorUnavailableError,
  type SqliteVectorUnavailableReason,
} from "../SqliteVectorUnavailableError.ts";

export type SqliteVectorPlatform =
  | "darwin-arm64"
  | "darwin-x86_64"
  | "linux-arm64"
  | "linux-arm64-musl"
  | "linux-x86_64"
  | "linux-x86_64-musl"
  | "win32-x86_64";

export type SqliteVectorCapability =
  | { readonly status: "disabled" }
  | { readonly extensionPath: string; readonly status: "loaded" }
  | {
      readonly message: string;
      readonly reason: SqliteVectorUnavailableReason;
      readonly status: "unavailable";
    };

const platformExtensions: Readonly<Record<string, string>> = {
  darwin: ".dylib",
  linux: ".so",
  win32: ".dll",
};

const isMusl = (): boolean => {
  if (platform() !== "linux") return false;

  for (const file of ["/lib/ld-musl-x86_64.so.1", "/lib/ld-musl-aarch64.so.1"]) {
    if (existsSync(file)) return true;
  }

  try {
    if (execSync("ldd --version 2>&1", { encoding: "utf8" }).includes("musl")) return true;
  } catch {
    // Continue to static file checks.
  }

  try {
    if (existsSync("/etc/os-release")) {
      const release = readFileSync("/etc/os-release", "utf8");
      if (release.includes("Alpine") || release.includes("musl")) return true;
    }
  } catch {
    // Keep platform detection best-effort.
  }

  return false;
};

export const currentSqliteVectorPlatform = (): SqliteVectorPlatform => {
  const runtimePlatform = platform();
  const runtimeArch = arch();

  if (runtimePlatform === "darwin") {
    if (runtimeArch === "arm64") return "darwin-arm64";
    if (runtimeArch === "x64" || runtimeArch === "ia32") return "darwin-x86_64";
  }

  if (runtimePlatform === "linux") {
    const musl = isMusl() ? "-musl" : "";
    if (runtimeArch === "arm64") return `linux-arm64${musl}` as SqliteVectorPlatform;
    if (runtimeArch === "x64" || runtimeArch === "ia32") {
      return `linux-x86_64${musl}` as SqliteVectorPlatform;
    }
  }

  if (runtimePlatform === "win32") {
    if (runtimeArch === "x64" || runtimeArch === "ia32") return "win32-x86_64";
  }

  throw new SqliteVectorUnavailableError({
    message: `Unsupported sqlite-vector platform: ${runtimePlatform}-${runtimeArch}`,
    operation: "detectVectorPlatform",
    platform: `${runtimePlatform}-${runtimeArch}`,
    reason: "unsupported_platform",
  });
};

export const sqliteVectorPackageName = (vectorPlatform = currentSqliteVectorPlatform()): string =>
  `@sqliteai/sqlite-vector-${vectorPlatform}`;

const sqliteVectorBinaryName = (): string => {
  const extension = platformExtensions[platform()];
  if (extension === undefined) {
    throw new SqliteVectorUnavailableError({
      message: `Unsupported sqlite-vector binary extension for platform: ${platform()}`,
      operation: "resolveVectorBinaryName",
      platform: platform(),
      reason: "unsupported_platform",
    });
  }

  return `vector${extension}`;
};

export const resolveSqliteVectorExtensionPathSync = (): string => {
  const vectorPlatform = currentSqliteVectorPlatform();
  const packageName = sqliteVectorPackageName(vectorPlatform);

  try {
    const packageEntry = import.meta.resolve(packageName);
    const extensionPath = packageEntry
      .replace(/\/index\.js$/u, `/${sqliteVectorBinaryName()}`)
      .replace(/^file:\/\//u, "");

    if (!existsSync(extensionPath)) {
      throw new SqliteVectorUnavailableError({
        extensionPath,
        message: `sqlite-vector binary was not found: ${extensionPath}`,
        operation: "resolveVectorExtensionPath",
        platform: vectorPlatform,
        reason: "binary_missing",
      });
    }

    return resolve(extensionPath);
  } catch (cause) {
    if (cause instanceof SqliteVectorUnavailableError) throw cause;

    throw new SqliteVectorUnavailableError({
      cause,
      message: `sqlite-vector package is not installed for platform: ${vectorPlatform}`,
      operation: "resolveVectorExtensionPath",
      platform: vectorPlatform,
      reason: "package_missing",
    });
  }
};

export const resolveSqliteVectorExtensionPath: Effect.Effect<string, SqliteVectorUnavailableError> =
  Effect.try({
    catch: (cause) =>
      cause instanceof SqliteVectorUnavailableError
        ? cause
        : new SqliteVectorUnavailableError({
            cause,
            message: "Failed to resolve sqlite-vector extension path",
            operation: "resolveVectorExtensionPath",
            reason: "unknown",
          }),
    try: resolveSqliteVectorExtensionPathSync,
  });
