import { NodeHttpServer, NodeServices } from "@effect/platform-node";
import {
  defaultLayer as CycleLoggingLive,
  logInfo,
  type CycleLogConfigInput,
} from "@cycle/logging";
import { Context, Effect, Exit, FileSystem, Layer, Path, Scope } from "effect";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import { makeCycleApi, makeCycleApiLayer } from "./CycleApi.ts";
import { CycleApiServerError } from "./errors/index.ts";
import type {
  CycleApi,
  CycleApiMcpOptions,
  CycleApiOptions,
  RuntimeDiscoveryFile,
} from "./http/runtime/CycleApiRuntime.ts";

export type CycleApiServerOptions = CycleApiOptions & {
  readonly host?: "127.0.0.1" | "localhost";
  readonly logging?: CycleLogConfigInput;
  readonly port?: number;
  readonly runtimeFile?: string;
};

export type CycleApiServerHandle = {
  readonly api: CycleApi;
  readonly baseUrl: string;
  readonly close: () => Promise<void>;
  readonly port: number;
  readonly server: HttpServer.HttpServer["Service"];
};

const apiLogging = (logging: CycleLogConfigInput | undefined): CycleLogConfigInput => ({
  ...logging,
  packageName: logging?.packageName ?? "api",
});

export const startCycleApiServer = (
  options: CycleApiServerOptions,
): Promise<CycleApiServerHandle> =>
  Effect.runPromise(
    startCycleApiServerEffect(options).pipe(
      Effect.provide([NodeServices.layer, CycleLoggingLive(apiLogging(options.logging))]),
    ),
  );

export const startCycleApiServerEffect = (
  options: CycleApiServerOptions,
): Effect.Effect<CycleApiServerHandle, unknown, NodeServices.NodeServices> =>
  Effect.gen(function* () {
    const host = options.host ?? "127.0.0.1";
    const logging = apiLogging(options.logging);
    assertLoopback(host);
    const configuredBaseUrl =
      options.baseUrl ??
      (options.port === undefined ? undefined : `http://${host}:${options.port}`);
    const serverOptions = withServerMcpDefaults({
      ...options,
      ...(configuredBaseUrl === undefined ? {} : { baseUrl: configuredBaseUrl }),
    });

    const scope = yield* Scope.make("sequential");
    const api = makeCycleApi({
      ...serverOptions,
      baseUrl: serverOptions.baseUrl ?? `http://${host}:${options.port ?? 0}`,
    });
    const { createServer } = yield* Effect.tryPromise({
      try: () => import("node:http"),
      catch: (cause) =>
        new CycleApiServerError({
          cause,
          message: cause instanceof Error ? cause.message : "import node:http failed",
          operation: "import node:http",
        }),
    });
    const routes = (makeCycleApiLayer(serverOptions) as Layer.Layer<never, unknown, any>).pipe(
      Layer.provide(CycleLoggingLive(logging)),
    );
    const serverLayer = HttpRouter.serve(routes, {
      disableListenLog: true,
      disableLogger: true,
    }).pipe(
      Layer.provideMerge(
        NodeHttpServer.layer(createServer, {
          host,
          port: options.port ?? 0,
        }),
      ),
    );
    const context = yield* Layer.buildWithScope(serverLayer as any, scope);
    const server = Context.get(context, HttpServer.HttpServer);
    const services = yield* Effect.context<NodeServices.NodeServices>();

    if (server.address._tag !== "TcpAddress") {
      yield* Scope.close(scope, Exit.void);
      yield* disposeApi(api);
      return yield* Effect.die(new Error("Cycle API server did not bind to a TCP address."));
    }

    const baseUrl = `http://${host}:${server.address.port}`;
    yield* logInfo("api", "api server started", {
      baseUrl,
      host,
      port: server.address.port,
      runtimeFile: options.runtimeFile ?? null,
    });

    if (options.runtimeFile !== undefined) {
      const mcpPath = hostedMcpPath(serverOptions.mcp);
      yield* writeRuntimeDiscoveryFile(options.runtimeFile, {
        apiVersion: options.apiVersion ?? "0.1.0",
        baseUrl,
        ...(mcpPath === undefined
          ? {}
          : {
              mcpPath,
              mcpUrl: `${baseUrl}${mcpPath}`,
            }),
        pid: globalThis.process?.pid ?? 0,
        specUrl: `${baseUrl}/spec.json`,
        startedAt: new Date().toISOString(),
      });
    }

    return {
      api,
      baseUrl,
      close: () =>
        Effect.runPromiseWith(services)(
          Effect.gen(function* () {
            yield* Scope.close(scope, Exit.void);
            yield* disposeApi(api);
            if (options.runtimeFile !== undefined) {
              const fs = yield* FileSystem.FileSystem;
              yield* fs.remove(options.runtimeFile, { force: true });
            }
            yield* logInfo("api", "api server stopped", { baseUrl });
          }),
        ),
      port: server.address.port,
      server,
    };
  }) as Effect.Effect<CycleApiServerHandle, unknown, NodeServices.NodeServices>;

const disposeApi = (api: CycleApi): Effect.Effect<void, unknown> =>
  Effect.tryPromise({
    try: () => api.dispose(),
    catch: (cause) =>
      new CycleApiServerError({
        cause,
        message: cause instanceof Error ? cause.message : "dispose api failed",
        operation: "dispose api",
      }),
  });

const withServerMcpDefaults = (options: CycleApiServerOptions): CycleApiServerOptions => {
  const mcp = options.mcp;
  if (mcp === false || mcp === undefined || mcp.enabled === false) return options;

  return {
    ...options,
    mcp: {
      ...mcp,
      apiToken: mcp.apiToken ?? options.staticToken,
      env: {
        ...process.env,
        ...mcp.env,
        ...(options.runtimeFile === undefined
          ? {}
          : { CYCLE_API_RUNTIME_FILE: options.runtimeFile }),
      },
    },
  };
};

const hostedMcpPath = (mcp: false | CycleApiMcpOptions | undefined): string | undefined => {
  if (mcp === false || mcp === undefined || mcp.enabled === false) return undefined;
  return mcp.path ?? "/mcp";
};

const writeRuntimeDiscoveryFile = (
  filePath: string,
  contents: RuntimeDiscoveryFile,
): Effect.Effect<void, unknown, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    yield* fs.makeDirectory(path.dirname(filePath), { recursive: true, mode: 0o700 });
    yield* fs.writeFileString(filePath, `${JSON.stringify(contents, null, 2)}\n`, {
      mode: 0o600,
    });
  });

const assertLoopback = (host: string): void => {
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error("Cycle API server can only bind to a loopback host.");
  }
};
