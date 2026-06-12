import { NodeHttpServer, NodeServices } from "@effect/platform-node";
import { Context, Effect, Exit, FileSystem, Layer, Path, Scope } from "effect";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import {
  makeCycleApi,
  makeCycleApiLayer,
  type CycleApiMcpOptions,
  type CycleApi,
  type CycleApiOptions,
  type RuntimeDiscoveryFile,
} from "./CycleApi.ts";

export type CycleApiServerOptions = CycleApiOptions & {
  readonly host?: "127.0.0.1" | "localhost";
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

export const startCycleApiServer = (
  options: CycleApiServerOptions,
): Promise<CycleApiServerHandle> =>
  Effect.runPromise(startCycleApiServerEffect(options).pipe(Effect.provide(NodeServices.layer)));

export const startCycleApiServerEffect = (
  options: CycleApiServerOptions,
): Effect.Effect<CycleApiServerHandle, unknown, NodeServices.NodeServices> =>
  Effect.gen(function* () {
    const host = options.host ?? "127.0.0.1";
    assertLoopback(host);
    const serverOptions = withServerMcpDefaults(options);

    const scope = yield* Scope.make("sequential");
    const api = makeCycleApi({
      ...serverOptions,
      baseUrl: `http://${host}:${options.port ?? 0}`,
    });
    const { createServer } = yield* Effect.promise(() => import("node:http"));
    const routes = makeCycleApiLayer(serverOptions) as Layer.Layer<never, unknown, any>;
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

    if (server.address._tag !== "TcpAddress") {
      yield* Scope.close(scope, Exit.void);
      yield* Effect.promise(() => api.dispose());
      return yield* Effect.die(new Error("Cycle API server did not bind to a TCP address."));
    }

    const baseUrl = `http://${host}:${server.address.port}`;

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
        Effect.runPromise(
          Effect.gen(function* () {
            yield* Scope.close(scope, Exit.void);
            yield* Effect.promise(() => api.dispose());
            if (options.runtimeFile !== undefined) {
              const fs = yield* FileSystem.FileSystem;
              yield* fs.remove(options.runtimeFile, { force: true });
            }
          }).pipe(Effect.provide(NodeServices.layer)),
        ),
      port: server.address.port,
      server,
    };
  }) as Effect.Effect<CycleApiServerHandle, unknown, NodeServices.NodeServices>;

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
