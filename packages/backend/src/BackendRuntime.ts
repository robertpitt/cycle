import { AgentProviderDetectorLive } from "@cycle/agents/detection";
import { AppConfigLive } from "@cycle/config/app-config-live";
import { GitRepositoryLive, WorktreeServiceLive } from "@cycle/git";
import { Context, Effect, Layer } from "effect";
import { BackendApi, BackendApiLive, type BackendApiHandle } from "./BackendApi.ts";
import { BackendDatabaseLive } from "./BackendDatabase.ts";
import { type BackendStartOptions } from "./BackendConfig.ts";
import { BackendAlreadyStarted, type BackendError, errorMessage } from "./BackendErrors.ts";
import { type BackendStatus } from "./BackendSchemas.ts";
import { LocalSettingsLive } from "./LocalSettings.ts";
import { LocalWorkspaceLive } from "./LocalWorkspace.ts";
import { RepositoryBootstrap, RepositoryBootstrapLive } from "./RepositoryBootstrap.ts";

export { AppConfigLive } from "@cycle/config/app-config-live";

export type BackendHandle = {
  readonly baseUrl?: string;
  readonly close: () => Promise<void>;
  readonly host?: string;
  readonly mcpPath?: string;
  readonly mcpUrl?: string;
  readonly port?: number;
  readonly runtimeFile?: string;
  readonly startedAt: string;
};

export class BackendHandleService extends Context.Service<BackendHandleService, BackendHandle>()(
  "@cycle/backend/BackendHandle",
) {}

export type BackendRuntimeService = {
  readonly start: (options?: BackendStartOptions) => Effect.Effect<BackendHandle, BackendError>;
  readonly status: () => Effect.Effect<BackendStatus, BackendError>;
};

export class BackendRuntime extends Context.Service<BackendRuntime, BackendRuntimeService>()(
  "@cycle/backend/BackendRuntime",
) {}

const nowIso = (): string => new Date().toISOString();

export const BackendRuntimeLive = Layer.effect(
  BackendRuntime,
  Effect.gen(function* () {
    const api = yield* BackendApi;
    const bootstrap = yield* RepositoryBootstrap;
    let apiHandle: BackendApiHandle | undefined;
    let backendHandle: BackendHandle | undefined;
    let lifecycle: BackendStatus["lifecycle"] = "stopped";
    let lastFailure: string | undefined;
    let startedAt: string | undefined;

    const start = (options: BackendStartOptions = {}) =>
      Effect.gen(function* () {
        if (backendHandle !== undefined) return backendHandle;

        lifecycle = "starting";
        startedAt = nowIso();

        const startedApi = yield* api.start(options).pipe(
          Effect.mapError((error) => {
            lifecycle = "failed";
            lastFailure = errorMessage(error);
            return error;
          }),
        );
        apiHandle = startedApi;

        yield* bootstrap.start().pipe(
          Effect.catch((error) =>
            Effect.sync(() => {
              lastFailure = errorMessage(error);
            }),
          ),
        );

        lifecycle = "running";
        backendHandle = {
          baseUrl: startedApi.baseUrl,
          close: async () => {
            await startedApi.close();
            lifecycle = "stopped";
          },
          host: options.host,
          mcpPath: startedApi.mcpPath,
          mcpUrl: startedApi.mcpUrl,
          port: startedApi.port,
          runtimeFile: startedApi.runtimeFile,
          startedAt,
        };
        return backendHandle;
      });

    const status = () =>
      Effect.gen(function* () {
        const bootstrapStatus = yield* bootstrap.status();
        const currentApi = apiHandle;

        return {
          api: {
            ...(currentApi?.baseUrl === undefined ? {} : { baseUrl: currentApi.baseUrl }),
            ...(currentApi?.mcpUrl === undefined ? {} : { mcpUrl: currentApi.mcpUrl }),
            ...(currentApi?.port === undefined ? {} : { port: currentApi.port }),
            state:
              currentApi === undefined ? "stopped" : currentApi.started ? "running" : "disabled",
          },
          bootstrap: bootstrapStatus,
          lifecycle,
          ...(lastFailure === undefined ? {} : { lastFailure }),
          repositories: bootstrapStatus.repositories,
          ...(currentApi?.runtimeFile === undefined ? {} : { runtimeFile: currentApi.runtimeFile }),
          ...(startedAt === undefined ? {} : { startedAt }),
          updatedAt: nowIso(),
        } satisfies BackendStatus;
      });

    return BackendRuntime.of({
      start,
      status,
    });
  }),
);

export const startBackend = (
  options: BackendStartOptions = {},
): Effect.Effect<BackendHandle, BackendError, BackendRuntime> =>
  Effect.gen(function* () {
    const runtime = yield* BackendRuntime;
    return yield* runtime.start(options);
  });

export const BackendLive = (options: BackendStartOptions = {}) =>
  Layer.effect(
    BackendHandleService,
    Effect.acquireRelease(
      startBackend(options).pipe(Effect.map((handle) => BackendHandleService.of(handle))),
      (handle) =>
        Effect.tryPromise({
          try: () => handle.close(),
          catch: () => undefined,
        }).pipe(Effect.catch(() => Effect.void)),
    ),
  );

export const launchBackend = (
  options: BackendStartOptions = {},
): Effect.Effect<never, BackendError, BackendRuntime> =>
  startBackend(options).pipe(Effect.andThen(Effect.never));

export const BackendRuntimeTest = (service: BackendRuntimeService) =>
  Layer.succeed(BackendRuntime, BackendRuntime.of(service));

const makeBackendServiceLayers = (options: BackendStartOptions = {}) => {
  const AppConfigServiceLive = AppConfigLive;
  const LocalWorkspaceServiceLive = LocalWorkspaceLive.pipe(
    Layer.provide(Layer.mergeAll(AppConfigServiceLive, GitRepositoryLive)),
  );
  const LocalSettingsServiceLive = LocalSettingsLive.pipe(
    Layer.provide(Layer.mergeAll(AppConfigServiceLive, LocalWorkspaceServiceLive)),
  );
  const BackendDatabaseServiceLive = BackendDatabaseLive(options).pipe(
    Layer.provide(LocalSettingsServiceLive),
  );
  const RepositoryBootstrapServiceLive = RepositoryBootstrapLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        BackendDatabaseServiceLive,
        LocalSettingsServiceLive,
        GitRepositoryLive,
        LocalWorkspaceServiceLive,
      ),
    ),
  );
  const BackendApiServiceLive = BackendApiLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        AgentProviderDetectorLive,
        AppConfigServiceLive,
        BackendDatabaseServiceLive,
        GitRepositoryLive,
        LocalSettingsServiceLive,
        LocalWorkspaceServiceLive,
        RepositoryBootstrapServiceLive,
        WorktreeServiceLive,
      ),
    ),
  );
  const BackendRuntimeServiceLive = BackendRuntimeLive.pipe(
    Layer.provide(Layer.mergeAll(BackendApiServiceLive, RepositoryBootstrapServiceLive)),
  );

  return {
    BackendApiServiceLive,
    BackendDatabaseServiceLive,
    BackendRuntimeServiceLive,
    LocalSettingsServiceLive,
    LocalWorkspaceServiceLive,
    RepositoryBootstrapServiceLive,
  } as const;
};

export const BackendServicesLive = (options: BackendStartOptions = {}) =>
  makeBackendServiceLayers(options).BackendRuntimeServiceLive;

export const BackendShellServicesLive = (options: BackendStartOptions = {}) => {
  const layers = makeBackendServiceLayers(options);

  return Layer.mergeAll(
    layers.BackendRuntimeServiceLive,
    layers.LocalSettingsServiceLive,
    layers.LocalWorkspaceServiceLive,
    layers.RepositoryBootstrapServiceLive,
  );
};

export const backendAlreadyStarted = () =>
  new BackendAlreadyStarted({
    message: "Backend is already started.",
    operation: "BackendRuntime.start",
  });
