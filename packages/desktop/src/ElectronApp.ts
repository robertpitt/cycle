import { Context, Cause, Deferred, Effect, Layer, Queue, Scope } from "effect";
import { app } from "electron";
import { ElectronRuntime } from "./ElectronRuntime.ts";
import { ProcessLifecycle, type ProcessLifecycleEvent } from "./ProcessLifecycle.ts";
import { ElectronError } from "./errors/ElectronError.ts";

export type ElectronAppLifecycleHandlers = {
  readonly onActivate: Effect.Effect<void, unknown>;
};

export type ElectronAppService = {
  readonly appPath: Effect.Effect<string>;
  readonly awaitShutdown: Effect.Effect<void>;
  readonly getPath: (name: "home") => Effect.Effect<string>;
  readonly platform: NodeJS.Platform;
  readonly quit: Effect.Effect<void>;
  readonly startLifecycleSupervision: (
    handlers: ElectronAppLifecycleHandlers,
  ) => Effect.Effect<void, never, Scope.Scope>;
  readonly whenReady: Effect.Effect<void, ElectronError>;
};

export class ElectronApp extends Context.Service<ElectronApp, ElectronAppService>()(
  "@cycle/desktop/ElectronApp",
) {}

const logSupervisionFailure = (
  source: string,
  event: string,
  cause: Cause.Cause<unknown>,
): Effect.Effect<void> =>
  Effect.logError("desktop lifecycle handler failed").pipe(
    Effect.annotateLogs({
      cause: Cause.pretty(cause),
      event,
      service: "desktop",
      source,
    }),
  );

const isExpectedAbortError = (error: unknown): boolean =>
  error instanceof Error &&
  error.name === "AbortError" &&
  "code" in error &&
  error.code === "ABORT_ERR";

const superviseProcessEvents = (
  events: Queue.Dequeue<ProcessLifecycleEvent>,
  requestShutdown: Effect.Effect<void>,
): Effect.Effect<void, never, Scope.Scope> =>
  Queue.take(events).pipe(
    Effect.flatMap((event) =>
      isExpectedAbortError(event.error)
        ? Effect.logWarning("process lifecycle abort ignored").pipe(
            Effect.annotateLogs({
              error: event.error,
              event: event.type,
              service: "desktop",
              source: "process",
            }),
          )
        : Effect.logError("process lifecycle event").pipe(
            Effect.annotateLogs({
              error: event.error,
              event: event.type,
              service: "desktop",
              source: "process",
            }),
            Effect.andThen(requestShutdown),
          ),
    ),
    Effect.forever,
    Effect.forkScoped,
    Effect.asVoid,
  );

export const ElectronAppLive = Layer.effect(
  ElectronApp,
  Effect.gen(function* () {
    const processLifecycle = yield* ProcessLifecycle;
    const runtime = yield* ElectronRuntime;
    const shutdown = yield* Deferred.make<void>();
    const requestShutdown = Deferred.succeed(shutdown, undefined).pipe(Effect.asVoid);

    const runHandler = (name: string, handler: Effect.Effect<void, unknown>): void => {
      runtime.run(
        `electron.${name}`,
        handler.pipe(Effect.catchCause((cause) => logSupervisionFailure("electron", name, cause))),
      );
    };

    return {
      appPath: Effect.sync(() => app.getAppPath()),
      awaitShutdown: Deferred.await(shutdown),
      getPath: (name) => Effect.sync(() => app.getPath(name)),
      platform: process.platform,
      quit: Effect.sync(() => app.quit()),
      startLifecycleSupervision: (handlers: ElectronAppLifecycleHandlers) =>
        Effect.gen(function* () {
          const processEvents = yield* processLifecycle.events;
          yield* superviseProcessEvents(processEvents, requestShutdown);

          const onActivate = (): void => {
            runHandler("activate", handlers.onActivate);
          };
          const onBeforeQuit = (): void => {
            runHandler("before-quit", requestShutdown);
          };
          const onWindowAllClosed = (): void => {
            if (process.platform === "darwin") return;
            app.quit();
          };

          yield* Effect.acquireRelease(
            Effect.sync(() => {
              app.on("activate", onActivate);
              app.on("before-quit", onBeforeQuit);
              app.on("window-all-closed", onWindowAllClosed);
            }),
            () =>
              Effect.sync(() => {
                app.off("activate", onActivate);
                app.off("before-quit", onBeforeQuit);
                app.off("window-all-closed", onWindowAllClosed);
              }),
          );
        }),
      whenReady: Effect.tryPromise({
        try: () => app.whenReady().then(() => undefined),
        catch: (cause) =>
          new ElectronError({
            category: "electron",
            cause,
            message: cause instanceof Error ? cause.message : "app.whenReady failed.",
            operation: "app.whenReady",
          }),
      }),
    };
  }),
);
