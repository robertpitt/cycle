import { CycleLogFile, logDebug, logError, logInfo, logWarning } from "@cycle/logging";
import { Context, Effect, Layer } from "effect";

export type DesktopLogLevel = "debug" | "error" | "info" | "warn";

export type DesktopLoggerService = {
  readonly debug: (
    message: string,
    fields?: Readonly<Record<string, unknown>>,
  ) => Effect.Effect<void>;
  readonly error: (
    message: string,
    fields?: Readonly<Record<string, unknown>>,
  ) => Effect.Effect<void>;
  readonly info: (
    message: string,
    fields?: Readonly<Record<string, unknown>>,
  ) => Effect.Effect<void>;
  readonly path: Effect.Effect<string>;
  readonly warn: (
    message: string,
    fields?: Readonly<Record<string, unknown>>,
  ) => Effect.Effect<void>;
};

export class DesktopLogger extends Context.Service<DesktopLogger, DesktopLoggerService>()(
  "@cycle/desktop/DesktopLogger",
) {}

export const DesktopLoggerLive = Layer.effect(
  DesktopLogger,
  Effect.gen(function* () {
    const logFile = yield* CycleLogFile;
    const fields = (input: Readonly<Record<string, unknown>> = {}) => ({
      ...input,
      component: input.component ?? "desktop",
    });

    yield* logInfo("desktop", "desktop logger initialized", { logPath: logFile.pathSync });

    return DesktopLogger.of({
      debug: (message, input) => logDebug("desktop", message, fields(input)),
      error: (message, input) => logError("desktop", message, fields(input)),
      info: (message, input) => logInfo("desktop", message, fields(input)),
      path: logFile.path,
      warn: (message, input) => logWarning("desktop", message, fields(input)),
    });
  }),
);
