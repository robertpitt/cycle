import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { Cause, Config, Effect, Layer, Logger, References } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { OtlpSerialization, OtlpTracer } from "effect/unstable/observability";
import {
  activeLogPath,
  cycleLogConfig,
  normalizeService,
  type CycleLogConfig,
  type CycleLogConfigInput,
} from "./CycleLogConfig.ts";
import { CycleLogFile, CycleLogFileLive } from "./CycleLogFile.ts";
import { makeRotatingFileLogger } from "./internal/RotatingFileLogger.ts";

const NodeFileServicesLive = Layer.merge(NodeFileSystem.layer, NodePath.layer);

export const CycleLoggingLive = (
  input: CycleLogConfigInput = {},
): Layer.Layer<CycleLogFile, Config.ConfigError> =>
  Layer.unwrap(cycleLogConfig(input).pipe(Effect.map(makeLoggingLayer)));

export const annotateService = Effect.fn("annotateService")(function* <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  service: string,
  fields: Readonly<Record<string, unknown>> = {},
) {
  return yield* effect.pipe(Effect.annotateLogs({ ...fields, service: normalizeService(service) }));
});

export const withService = annotateService;

export const logInfo = Effect.fn("logInfo")(function* (
  service: string,
  message: string,
  fields: Readonly<Record<string, unknown>> = {},
) {
  return yield* Effect.logInfo(message).pipe(Effect.annotateLogs(logFields(service, fields)));
});

export const logWarning = Effect.fn("logWarning")(function* (
  service: string,
  message: string,
  fields: Readonly<Record<string, unknown>> = {},
) {
  return yield* Effect.logWarning(message).pipe(Effect.annotateLogs(logFields(service, fields)));
});

export const logError = Effect.fn("logError")(function* (
  service: string,
  message: string,
  fields: Readonly<Record<string, unknown>> = {},
) {
  return yield* Effect.logError(message).pipe(Effect.annotateLogs(logFields(service, fields)));
});

export const logDebug = Effect.fn("logDebug")(function* (
  service: string,
  message: string,
  fields: Readonly<Record<string, unknown>> = {},
) {
  return yield* Effect.logDebug(message).pipe(Effect.annotateLogs(logFields(service, fields)));
});

export const causeField = (cause: Cause.Cause<unknown>): Readonly<Record<string, unknown>> => ({
  cause: Cause.pretty(cause),
});

const makeLoggingLayer = (config: CycleLogConfig): Layer.Layer<CycleLogFile> => {
  const fileLogger = config.file.enabled ? [makeRotatingFileLogger(config)] : [];
  const consoleLogger =
    config.console === false
      ? []
      : config.console === "json"
        ? [Logger.consoleJson]
        : [Logger.consolePretty({ stderr: true })];
  const loggerLayer = Logger.layer([...consoleLogger, ...fileLogger, Logger.tracerLogger]).pipe(
    Layer.provide(NodeFileServicesLive),
  );

  return Layer.mergeAll(
    CycleLogFileLive(activeLogPath(config)),
    Layer.succeed(References.MinimumLogLevel, config.level),
    loggerLayer,
    otlpLayerFromConfig(config),
  );
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

const logFields = (
  service: string,
  fields: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => ({
  ...fields,
  service: normalizeService(service),
});
