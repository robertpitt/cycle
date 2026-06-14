import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { Cause, Context, Effect, Layer, Logger, References } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { OtlpSerialization, OtlpTracer } from "effect/unstable/observability";

export type CycleLogMode = "development" | "production";
export type CycleLogConsole = false | "json" | "pretty";
export type CycleLogLevel =
  | "All"
  | "Debug"
  | "Error"
  | "Fatal"
  | "Info"
  | "None"
  | "Trace"
  | "Warn";

export type CycleLogFileConfig = {
  readonly directory: string;
  readonly enabled: boolean;
  readonly filename: string;
};

export type CycleLogRotationConfig = {
  readonly maxBytes: number;
  readonly maxFiles: number;
};

export type CycleOtlpConfig = {
  readonly endpoint?: string;
  readonly enabled: boolean;
  readonly headers?: Readonly<Record<string, string>>;
  readonly serviceName?: string;
  readonly serviceVersion?: string;
};

export type CycleLogConfig = {
  readonly batchWindowMs: number;
  readonly console: CycleLogConsole;
  readonly file: CycleLogFileConfig;
  readonly level: CycleLogLevel;
  readonly mode: CycleLogMode;
  readonly otlp: CycleOtlpConfig;
  readonly rotation: CycleLogRotationConfig;
};

export type CycleLogConfigInput = Partial<Omit<CycleLogConfig, "file" | "otlp" | "rotation">> & {
  readonly file?: Partial<CycleLogFileConfig>;
  readonly otlp?: Partial<CycleOtlpConfig>;
  readonly rotation?: Partial<CycleLogRotationConfig>;
};

export type CycleLogFileShape = {
  readonly path: Effect.Effect<string>;
  readonly pathSync: string;
};

export class CycleLogFile extends Context.Service<CycleLogFile, CycleLogFileShape>()(
  "@cycle/logging/CycleLogFile",
) {}

const DEFAULT_FILENAME = "cycle.jsonl";
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_FILES = 5;
const DEFAULT_BATCH_WINDOW_MS = 1000;
const MAX_STRING_LENGTH = 2048;

const SECRET_KEY = /(authorization|bearer|credential|password|secret|token|api[-_]?key)/iu;
const URL_CREDENTIALS = /([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^\s/@]+@/gu;
const ASSIGNMENT_SECRET = /\b(token|password|secret|credential|authorization)=\S+/giu;

export const cycleLogDirectoryFromHome = (homeDirectory: string): string =>
  join(homeDirectory, ".cycle", "logs");

export const cycleLogPathFromHome = (homeDirectory: string): string =>
  join(cycleLogDirectoryFromHome(homeDirectory), DEFAULT_FILENAME);

export const activeLogPath = (config: CycleLogConfig): string =>
  join(config.file.directory, config.file.filename);

export const resolveCycleLogConfig = (
  input: CycleLogConfigInput = {},
  env: Readonly<Record<string, string | undefined>> = process.env,
): CycleLogConfig => {
  const mode = input.mode ?? modeFromEnv(env);
  const directory =
    input.file?.directory ?? env.CYCLE_LOG_DIR ?? cycleLogDirectoryFromHome(homedir());
  const filename = input.file?.filename ?? env.CYCLE_LOG_FILE ?? DEFAULT_FILENAME;
  const consoleValue = input.console ?? consoleFromEnv(env, mode);
  const otlpEndpoint = input.otlp?.endpoint ?? env.CYCLE_OTLP_ENDPOINT;

  return {
    batchWindowMs: positiveInt(
      input.batchWindowMs ?? numberFromEnv(env.CYCLE_LOG_BATCH_WINDOW_MS),
      DEFAULT_BATCH_WINDOW_MS,
    ),
    console: consoleValue,
    file: {
      directory,
      enabled: input.file?.enabled ?? env.CYCLE_LOG_FILE_ENABLED !== "false",
      filename,
    },
    level: input.level ?? levelFromEnv(env, mode),
    mode,
    otlp: {
      enabled: input.otlp?.enabled ?? (otlpEndpoint !== undefined && otlpEndpoint.length > 0),
      endpoint: otlpEndpoint,
      headers: input.otlp?.headers ?? headersFromEnv(env.CYCLE_OTLP_HEADERS),
      serviceName: input.otlp?.serviceName ?? "cycle",
      serviceVersion: input.otlp?.serviceVersion,
    },
    rotation: {
      maxBytes: positiveInt(
        input.rotation?.maxBytes ?? numberFromEnv(env.CYCLE_LOG_MAX_BYTES),
        DEFAULT_MAX_BYTES,
      ),
      maxFiles: positiveInt(
        input.rotation?.maxFiles ?? numberFromEnv(env.CYCLE_LOG_MAX_FILES),
        DEFAULT_MAX_FILES,
      ),
    },
  };
};

export const defaultLayer = (input: CycleLogConfigInput = {}): Layer.Layer<CycleLogFile> => {
  const config = resolveCycleLogConfig(input);
  const logPath = activeLogPath(config);
  const fileLogger = config.file.enabled ? [rotatingJsonLogger(config)] : [];
  const consoleLogger =
    config.console === false
      ? []
      : config.console === "json"
        ? [Logger.consoleJson]
        : [Logger.consolePretty({ stderr: true })];
  const loggerLayer = Logger.layer([...consoleLogger, ...fileLogger, Logger.tracerLogger]);
  const baseLayer = Layer.mergeAll(
    Layer.succeed(
      CycleLogFile,
      CycleLogFile.of({
        path: Effect.succeed(logPath),
        pathSync: logPath,
      }),
    ),
    Layer.succeed(References.MinimumLogLevel, config.level),
    loggerLayer,
  );
  const otlpLayer = otlpLayerFromConfig(config);

  return Layer.mergeAll(baseLayer, otlpLayer);
};

export const annotateService = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  service: string,
  fields: Readonly<Record<string, unknown>> = {},
): Effect.Effect<A, E, R> =>
  effect.pipe(Effect.annotateLogs({ ...fields, service: normalizeService(service) }));

export const withService = annotateService;

export const logInfo = (
  service: string,
  message: string,
  fields: Readonly<Record<string, unknown>> = {},
): Effect.Effect<void> =>
  Effect.logInfo(message).pipe(Effect.annotateLogs(logFields(service, fields)));

export const logWarning = (
  service: string,
  message: string,
  fields: Readonly<Record<string, unknown>> = {},
): Effect.Effect<void> =>
  Effect.logWarning(message).pipe(Effect.annotateLogs(logFields(service, fields)));

export const logError = (
  service: string,
  message: string,
  fields: Readonly<Record<string, unknown>> = {},
): Effect.Effect<void> =>
  Effect.logError(message).pipe(Effect.annotateLogs(logFields(service, fields)));

export const logDebug = (
  service: string,
  message: string,
  fields: Readonly<Record<string, unknown>> = {},
): Effect.Effect<void> =>
  Effect.logDebug(message).pipe(Effect.annotateLogs(logFields(service, fields)));

export const causeField = (cause: Cause.Cause<unknown>): Readonly<Record<string, unknown>> => ({
  cause: Cause.pretty(cause),
});

const logFields = (
  service: string,
  fields: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => ({
  ...fields,
  service: normalizeService(service),
});

const modeFromEnv = (env: Readonly<Record<string, string | undefined>>): CycleLogMode => {
  if (env.CYCLE_LOG_MODE === "production" || env.CYCLE_LOG_MODE === "development") {
    return env.CYCLE_LOG_MODE;
  }
  if (env.ELECTRON_RENDERER_URL !== undefined) return "development";
  return env.NODE_ENV === "production" ? "production" : "development";
};

const consoleFromEnv = (
  env: Readonly<Record<string, string | undefined>>,
  mode: CycleLogMode,
): CycleLogConsole => {
  switch (env.CYCLE_LOG_CONSOLE) {
    case "false":
    case "0":
      return false;
    case "json":
      return "json";
    case "pretty":
    case "true":
    case "1":
      return "pretty";
    default:
      return env.ELECTRON_RENDERER_URL !== undefined && mode === "development" ? "pretty" : false;
  }
};

const levelFromEnv = (
  env: Readonly<Record<string, string | undefined>>,
  mode: CycleLogMode,
): CycleLogLevel => {
  const value = env.CYCLE_LOG_LEVEL?.toLowerCase();
  switch (value) {
    case "all":
      return "All";
    case "trace":
      return "Trace";
    case "debug":
      return "Debug";
    case "info":
      return "Info";
    case "warn":
    case "warning":
      return "Warn";
    case "error":
      return "Error";
    case "fatal":
      return "Fatal";
    case "none":
      return "None";
    default:
      return mode === "development" ? "Debug" : "Info";
  }
};

const numberFromEnv = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const positiveInt = (value: number | undefined, fallback: number): number =>
  value !== undefined && Number.isInteger(value) && value > 0 ? value : fallback;

const headersFromEnv = (
  value: string | undefined,
): Readonly<Record<string, string>> | undefined => {
  if (value === undefined || value.trim().length === 0) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([key, header]) =>
        typeof header === "string" ? [[key, header]] : [],
      ),
    );
  } catch {
    return undefined;
  }
};

const otlpLayerFromConfig = (config: CycleLogConfig): Layer.Layer<never> => {
  if (!config.otlp.enabled || config.otlp.endpoint === undefined || config.otlp.endpoint === "") {
    return Layer.empty;
  }

  return OtlpTracer.layer({
    headers: config.otlp.headers,
    resource: {
      serviceName: config.otlp.serviceName,
      serviceVersion: config.otlp.serviceVersion,
    },
    url: config.otlp.endpoint,
  }).pipe(Layer.provide(OtlpSerialization.layerJson), Layer.provide(FetchHttpClient.layer));
};

const rotatingJsonLogger = (config: CycleLogConfig) => {
  const formatter = Logger.make<unknown, string>((options) =>
    formatJsonLine(Logger.formatStructured.log(options)),
  );
  const writer = makeRotatingWriter(config);

  return Logger.batched(formatter, {
    flush: (entries) => writer(entries),
    window: config.batchWindowMs,
  });
};

type StructuredLog = ReturnType<typeof Logger.formatStructured.log>;

const formatJsonLine = (entry: StructuredLog): string => {
  const rawAnnotations = isRecord(entry.annotations) ? entry.annotations : {};
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

export const normalizeService = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^@cycle\//u, "")
    .replace(/^cycle[-_.]/u, "")
    .replace(/[^a-z0-9]+/gu, "");

  switch (normalized) {
    case "gitdb":
      return "gitdb";
    case "git-db":
      return "gitdb";
    case "":
      return "app";
    default:
      return normalized;
  }
};

const makeRotatingWriter = (
  config: CycleLogConfig,
): ((entries: ReadonlyArray<string>) => Effect.Effect<void>) => {
  const filePath = activeLogPath(config);
  let chain: Promise<void> = Promise.resolve();

  return (entries) =>
    Effect.tryPromise({
      try: () => {
        chain = chain
          .then(() => flushRotating(filePath, entries, config.rotation))
          .catch(() => undefined);
        return chain;
      },
      catch: () => undefined,
    }).pipe(Effect.orElseSucceed(() => undefined));
};

const flushRotating = async (
  filePath: string,
  entries: ReadonlyArray<string>,
  rotation: CycleLogRotationConfig,
): Promise<void> => {
  if (entries.length === 0) return;

  const payload = `${entries.join("\n")}\n`;
  const payloadBytes = Buffer.byteLength(payload);
  await mkdir(dirname(filePath), { mode: 0o700, recursive: true });

  const currentSize = await fileSize(filePath);
  if (currentSize > 0 && currentSize + payloadBytes > rotation.maxBytes) {
    await rotate(filePath, rotation.maxFiles);
  }

  await writeFile(filePath, payload, {
    flag: "a",
    mode: 0o600,
  });
};

const rotate = async (filePath: string, maxFiles: number): Promise<void> => {
  await removeIfExists(rotatedPath(filePath, maxFiles));

  for (let index = maxFiles - 1; index >= 1; index--) {
    await renameIfExists(rotatedPath(filePath, index), rotatedPath(filePath, index + 1));
  }

  await renameIfExists(filePath, rotatedPath(filePath, 1));
};

const fileSize = async (filePath: string): Promise<number> => {
  try {
    return (await stat(filePath)).size;
  } catch {
    return 0;
  }
};

const rotatedPath = (filePath: string, index: number): string => {
  const ext = extname(filePath);
  const base = basename(filePath, ext);
  return join(dirname(filePath), `${base}.${index}${ext}`);
};

const removeIfExists = async (filePath: string): Promise<void> => {
  try {
    await rm(filePath, { force: true });
  } catch {
    // Logging must not fail because an old rotated file could not be removed.
  }
};

const renameIfExists = async (from: string, to: string): Promise<void> => {
  try {
    await rename(from, to);
  } catch {
    // Missing rotation files are expected.
  }
};

const redactObject = (value: Readonly<Record<string, unknown>>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = SECRET_KEY.test(key) ? "<redacted>" : redactValue(item);
  }
  return out;
};

const redactValue = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (typeof value === "string") return redactString(value);
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return "<circular>";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
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

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
