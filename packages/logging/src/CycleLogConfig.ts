import { homedir } from "node:os";
import { join } from "node:path";
import { Config, Option, Schema } from "effect";

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
  readonly packageName: string;
  readonly rotation: CycleLogRotationConfig;
};

export type CycleLogConfigInput = Partial<Omit<CycleLogConfig, "file" | "otlp" | "rotation">> & {
  readonly file?: Partial<CycleLogFileConfig>;
  readonly otlp?: Partial<CycleOtlpConfig>;
  readonly rotation?: Partial<CycleLogRotationConfig>;
};

const DEFAULT_FILENAME = "cycle.jsonl";
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_FILES = 5;
const DEFAULT_BATCH_WINDOW_MS = 1000;
const DEFAULT_PACKAGE_NAME = "app";
const SERVICE_NAME_PREFIX = "@cycle/";

const PositiveInt = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(1, { expected: "a positive integer" }),
);
const OtlpHeaders = Schema.fromJsonString(Schema.Record(Schema.String, Schema.String));
const LogMode = Schema.Literals(["development", "production"]);
const LogConsole = Schema.Literals(["false", "0", "json", "pretty", "true", "1"]);
const LogLevel = Schema.Literals([
  "all",
  "trace",
  "debug",
  "info",
  "warn",
  "warning",
  "error",
  "fatal",
  "none",
]);

const optional = <A>(config: Config.Config<A>): Config.Config<A | undefined> =>
  config.pipe(Config.option, Config.map(Option.getOrUndefined));

const CycleLogEnvironment = Config.all({
  batchWindowMs: optional(Config.schema(PositiveInt, "CYCLE_LOG_BATCH_WINDOW_MS")),
  console: optional(Config.schema(LogConsole, "CYCLE_LOG_CONSOLE")),
  directory: optional(Config.nonEmptyString("CYCLE_LOG_DIR")),
  electronRendererUrl: optional(Config.string("ELECTRON_RENDERER_URL")),
  fileEnabled: optional(Config.boolean("CYCLE_LOG_FILE_ENABLED")),
  filename: optional(Config.nonEmptyString("CYCLE_LOG_FILE")),
  level: optional(Config.schema(LogLevel, "CYCLE_LOG_LEVEL")),
  maxBytes: optional(Config.schema(PositiveInt, "CYCLE_LOG_MAX_BYTES")),
  maxFiles: optional(Config.schema(PositiveInt, "CYCLE_LOG_MAX_FILES")),
  mode: optional(Config.schema(LogMode, "CYCLE_LOG_MODE")),
  nodeEnvironment: optional(Config.string("NODE_ENV")),
  otlpEnabled: optional(Config.boolean("CYCLE_OTLP_ENABLED")),
  otlpEndpoint: optional(Config.string("CYCLE_OTLP_ENDPOINT")),
  otlpHeaders: optional(Config.schema(OtlpHeaders, "CYCLE_OTLP_HEADERS")),
  otlpServiceName: optional(Config.string("CYCLE_OTLP_SERVICE_NAME")),
  otlpServiceVersion: optional(Config.string("CYCLE_OTLP_SERVICE_VERSION")),
  otelServiceName: optional(Config.string("OTEL_SERVICE_NAME")),
  packageName: optional(Config.string("CYCLE_PACKAGE_NAME")),
});

type CycleLogEnvironment = Config.Success<typeof CycleLogEnvironment>;

export const cycleLogConfig = (input: CycleLogConfigInput = {}): Config.Config<CycleLogConfig> =>
  CycleLogEnvironment.pipe(Config.map((environment) => resolveCycleLogConfig(input, environment)));

export const normalizeService = (value: string): string =>
  `${SERVICE_NAME_PREFIX}${normalizePackageName(value)}`;

export const normalizePackageName = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(new RegExp(`^${SERVICE_NAME_PREFIX}`, "u"), "")
    .replace(/^cycle[-_.]/u, "")
    .replace(/[^a-z0-9-]+/gu, "-")
    .replace(/-{2,}/gu, "-")
    .replace(/^-|-$/gu, "");

  return normalized === "" ? DEFAULT_PACKAGE_NAME : normalized;
};

export const activeLogPath = (config: CycleLogConfig): string =>
  join(config.file.directory, config.file.filename);

export const cycleLogDirectoryFromHome = (homeDirectory: string): string =>
  join(homeDirectory, ".cycle", "logs");

export const cycleLogPathFromHome = (homeDirectory: string): string =>
  join(cycleLogDirectoryFromHome(homeDirectory), DEFAULT_FILENAME);

const resolveCycleLogConfig = (
  input: CycleLogConfigInput,
  environment: CycleLogEnvironment,
): CycleLogConfig => {
  const mode = input.mode ?? environment.mode ?? modeFromEnvironment(environment);
  const packageName = normalizePackageName(
    input.packageName ?? environment.packageName ?? DEFAULT_PACKAGE_NAME,
  );
  const otlpEndpoint = input.otlp?.endpoint ?? environment.otlpEndpoint;

  return {
    batchWindowMs: input.batchWindowMs ?? environment.batchWindowMs ?? DEFAULT_BATCH_WINDOW_MS,
    console: input.console ?? consoleFromEnvironment(environment, mode),
    file: {
      directory:
        input.file?.directory ?? environment.directory ?? cycleLogDirectoryFromHome(homedir()),
      enabled: input.file?.enabled ?? environment.fileEnabled ?? true,
      filename: input.file?.filename ?? environment.filename ?? DEFAULT_FILENAME,
    },
    level: input.level ?? levelFromEnvironment(environment.level, mode),
    mode,
    otlp: {
      enabled:
        input.otlp?.enabled ??
        environment.otlpEnabled ??
        (otlpEndpoint !== undefined && otlpEndpoint.length > 0),
      endpoint: otlpEndpoint,
      headers: input.otlp?.headers ?? environment.otlpHeaders,
      serviceName: normalizeService(
        input.otlp?.serviceName ??
          environment.otlpServiceName ??
          environment.otelServiceName ??
          packageName,
      ),
      serviceVersion: input.otlp?.serviceVersion ?? environment.otlpServiceVersion,
    },
    packageName,
    rotation: {
      maxBytes: input.rotation?.maxBytes ?? environment.maxBytes ?? DEFAULT_MAX_BYTES,
      maxFiles: input.rotation?.maxFiles ?? environment.maxFiles ?? DEFAULT_MAX_FILES,
    },
  };
};

const modeFromEnvironment = (environment: CycleLogEnvironment): CycleLogMode =>
  environment.electronRendererUrl !== undefined || environment.nodeEnvironment !== "production"
    ? "development"
    : "production";

const consoleFromEnvironment = (
  environment: CycleLogEnvironment,
  mode: CycleLogMode,
): CycleLogConsole => {
  switch (environment.console) {
    case "false":
    case "0":
      return false;
    case "json":
      return "json";
    case "pretty":
    case "true":
    case "1":
      return "pretty";
    case undefined:
      return environment.electronRendererUrl !== undefined && mode === "development"
        ? "pretty"
        : false;
  }
};

const levelFromEnvironment = (
  value: CycleLogEnvironment["level"],
  mode: CycleLogMode,
): CycleLogLevel => {
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
    case undefined:
      return mode === "development" ? "Debug" : "Info";
  }
};
