import { mkdir, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Context, Effect, Layer } from "effect";
import { cycleLogPath } from "./CycleDirectory.ts";

export type DesktopLogLevel = "debug" | "error" | "info" | "warn";

export type DesktopLoggerService = {
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

const serialize = (
  level: DesktopLogLevel,
  message: string,
  fields: Readonly<Record<string, unknown>> = {},
): string => {
  const timestamp = new Date().toISOString();
  const payload = Object.keys(fields).length === 0 ? "" : ` ${JSON.stringify(fields)}`;

  return `[${timestamp}] ${level.toUpperCase()} ${message}${payload}\n`;
};

export const DesktopLoggerLive = Layer.effect(
  DesktopLogger,
  Effect.gen(function* () {
    const logPath = yield* cycleLogPath;

    const write = (
      level: DesktopLogLevel,
      message: string,
      fields?: Readonly<Record<string, unknown>>,
    ): Effect.Effect<void> =>
      Effect.tryPromise({
        try: async () => {
          await mkdir(dirname(logPath), { recursive: true });
          await appendFile(logPath, serialize(level, message, fields), "utf8");
        },
        catch: () => undefined,
      }).pipe(Effect.orElseSucceed(() => undefined));

    yield* write("info", "desktop logger initialized", { logPath });

    return DesktopLogger.of({
      error: (message, fields) => write("error", message, fields),
      info: (message, fields) => write("info", message, fields),
      path: Effect.succeed(logPath),
      warn: (message, fields) => write("warn", message, fields),
    });
  }),
);
