import {
  Effect,
  FileSystem,
  Logger,
  Path,
  PlatformError,
  Predicate,
  Semaphore,
  type Scope,
} from "effect";
import type { CycleLogConfig, CycleLogRotationConfig } from "../CycleLogConfig.ts";
import { activeLogPath, normalizeService } from "../CycleLogConfig.ts";

const MAX_STRING_LENGTH = 2048;
const SECRET_KEY = /(authorization|bearer|credential|password|secret|token|api[-_]?key)/iu;
const URL_CREDENTIALS = /([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^\s/@]+@/gu;
const ASSIGNMENT_SECRET = /\b(token|password|secret|credential|authorization)=\S+/giu;
const textEncoder = new TextEncoder();

type StructuredLog = ReturnType<typeof Logger.formatStructured.log>;

export const makeRotatingFileLogger = Effect.fn("makeRotatingFileLogger")(function* (
  config: CycleLogConfig,
): Effect.fn.Return<
  Logger.Logger<unknown, void>,
  never,
  FileSystem.FileSystem | Path.Path | Scope.Scope
> {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const writePermit = yield* Semaphore.make(1);
  const filePath = activeLogPath(config);
  const formatter = Logger.make<unknown, string>((options) =>
    formatJsonLine(Logger.formatStructured.log(options)),
  );

  return yield* Logger.batched(formatter, {
    flush: (entries) =>
      writePermit
        .withPermit(flushRotating(fileSystem, path, filePath, entries, config.rotation))
        .pipe(
          // File logging is deliberately best effort and must never recursively log its own failure.
          Effect.catch(() => Effect.void),
        ),
    window: config.batchWindowMs,
  });
});

const flushRotating = Effect.fn("flushRotating")(function* (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  filePath: string,
  entries: ReadonlyArray<string>,
  rotation: CycleLogRotationConfig,
): Effect.fn.Return<void, PlatformError.PlatformError> {
  if (entries.length === 0) return;

  const payload = `${entries.join("\n")}\n`;
  const payloadBytes = BigInt(textEncoder.encode(payload).byteLength);
  yield* fileSystem.makeDirectory(path.dirname(filePath), { mode: 0o700, recursive: true });

  const currentSize = yield* fileSize(fileSystem, filePath);
  if (currentSize > 0n && currentSize + payloadBytes > BigInt(rotation.maxBytes)) {
    yield* rotate(fileSystem, path, filePath, rotation.maxFiles);
  }

  yield* fileSystem.writeFileString(filePath, payload, {
    flag: "a",
    mode: 0o600,
  });
});

const fileSize = Effect.fn("fileSize")(function* (
  fileSystem: FileSystem.FileSystem,
  filePath: string,
): Effect.fn.Return<bigint, PlatformError.PlatformError> {
  return yield* fileSystem.stat(filePath).pipe(
    Effect.map((info) => BigInt(info.size)),
    Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(0n)),
  );
});

const rotate = Effect.fn("rotate")(function* (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  filePath: string,
  maxFiles: number,
): Effect.fn.Return<void, PlatformError.PlatformError> {
  yield* fileSystem.remove(rotatedPath(path, filePath, maxFiles), { force: true });

  for (let index = maxFiles - 1; index >= 1; index--) {
    yield* renameIfExists(
      fileSystem,
      rotatedPath(path, filePath, index),
      rotatedPath(path, filePath, index + 1),
    );
  }

  yield* renameIfExists(fileSystem, filePath, rotatedPath(path, filePath, 1));
});

const renameIfExists = Effect.fn("renameIfExists")(function* (
  fileSystem: FileSystem.FileSystem,
  from: string,
  to: string,
): Effect.fn.Return<void, PlatformError.PlatformError> {
  return yield* fileSystem
    .rename(from, to)
    .pipe(Effect.catchReason("PlatformError", "NotFound", () => Effect.void));
});

const rotatedPath = (path: Path.Path, filePath: string, index: number): string => {
  const extension = path.extname(filePath);
  const base = path.basename(filePath, extension);
  return path.join(path.dirname(filePath), `${base}.${index}${extension}`);
};

const formatJsonLine = (entry: StructuredLog): string => {
  const rawAnnotations = Predicate.isObject(entry.annotations) ? entry.annotations : {};
  const service = normalizeService(
    stringFrom(rawAnnotations.service) ?? stringFrom(rawAnnotations.scope) ?? "app",
  );
  const annotations = redactObject({ ...rawAnnotations });
  delete annotations.package;
  delete annotations.service;

  return JSON.stringify({
    timestamp: entry.timestamp,
    level: entry.level,
    message: redactValue(entry.message),
    service,
    component: stringFrom(rawAnnotations.component) ?? stringFrom(rawAnnotations.scope) ?? null,
    fiberId: entry.fiberId,
    cause: entry.cause === undefined ? undefined : redactString(entry.cause),
    spans: redactValue(entry.spans),
    fields: annotations,
  });
};

const redactObject = (value: Readonly<Record<string, unknown>>): Record<string, unknown> => {
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = SECRET_KEY.test(key) ? "<redacted>" : redactValue(item);
  }
  return output;
};

const redactValue = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (typeof value === "string") return redactString(value);
  if (!Predicate.isObjectOrArray(value)) return value;
  if (seen.has(value)) return "<circular>";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SECRET_KEY.test(key) ? "<redacted>" : redactValue(item, seen),
    ]),
  );
};

const redactString = (value: string): string => {
  const redacted = value
    .replace(URL_CREDENTIALS, "$1<redacted>@")
    .replace(ASSIGNMENT_SECRET, "$1=<redacted>");

  return redacted.length > MAX_STRING_LENGTH
    ? `${redacted.slice(0, MAX_STRING_LENGTH)}...`
    : redacted;
};

const stringFrom = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;
