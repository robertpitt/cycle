import { NodeHttpServer, NodeRuntime, NodeServices } from "@effect/platform-node";
import { defaultLayer as CycleLoggingLive, logInfo, logWarning } from "@cycle/logging";
import { Context, Effect, Exit, Layer, Scope } from "effect";
import {
  HttpMiddleware,
  HttpRouter,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";
import * as McpServer from "effect/unstable/ai/McpServer";
import { CycleMcpApiClientLive, type CycleMcpApiClientOptions } from "../client.ts";
import { CycleMcpToolsLive } from "../tools/layer.ts";
import { cycleMcpTools, mcpToolFromDefinition } from "../tools/registry.ts";

export type CycleMcpServerInfo = {
  readonly name?: string;
  readonly version?: string;
};

export type CycleMcpOptions = CycleMcpApiClientOptions & CycleMcpServerInfo;

export type CycleMcpHttpOptions = CycleMcpOptions & {
  readonly auth?: false | { readonly token: string };
  readonly host?: "127.0.0.1" | "localhost";
  readonly path?: string;
  readonly port?: number;
};

export type CycleMcpHttpServerHandle = {
  readonly baseUrl: string;
  readonly close: () => Promise<void>;
  readonly path: string;
  readonly port: number;
  readonly server: HttpServer.HttpServer["Service"];
};

export const makeCycleMcpStdioLayer = (options: CycleMcpOptions): Layer.Layer<never, unknown> =>
  CycleMcpToolsLive.pipe(
    Layer.provide(CycleMcpApiClientLive(withUserAgent(options))),
    Layer.provide(
      McpServer.layerStdio({
        name: options.name ?? "cycle",
        version: options.version ?? "0.0.0",
      }),
    ),
    Layer.provide(NodeServices.layer),
  ) as Layer.Layer<never, unknown>;

export const runCycleMcpStdio = (options: CycleMcpOptions): Effect.Effect<never, unknown> =>
  Layer.launch(makeCycleMcpStdioLayer(options));

export const runCycleMcpStdioMain = (options: CycleMcpOptions): void => {
  runCycleMcpStdio(options).pipe(Effect.provide(CycleLoggingLive()), NodeRuntime.runMain);
};

export const makeCycleMcpHttpLayer = (
  options: CycleMcpHttpOptions,
): Layer.Layer<never, unknown, HttpRouter.HttpRouter | NodeServices.NodeServices> => {
  const mcpLayer = CycleMcpToolsLive.pipe(
    Layer.provide(CycleMcpApiClientLive(withUserAgent(options))),
    Layer.provide(
      McpServer.layerHttp({
        name: options.name ?? "cycle",
        path: (options.path ?? "/mcp") as any,
        version: options.version ?? "0.0.0",
      }),
    ),
  ) as Layer.Layer<never, unknown, HttpRouter.HttpRouter | NodeServices.NodeServices>;

  return Layer.mergeAll(mcpLayer, httpCompatibilityLayer(options)) as Layer.Layer<
    never,
    unknown,
    HttpRouter.HttpRouter | NodeServices.NodeServices
  >;
};

export const startCycleMcpHttpServer = (
  options: CycleMcpHttpOptions,
): Promise<CycleMcpHttpServerHandle> =>
  Effect.runPromise(
    startCycleMcpHttpServerEffect(options).pipe(
      Effect.provide([NodeServices.layer, CycleLoggingLive()]),
    ),
  );

export const startCycleMcpHttpServerEffect = (
  options: CycleMcpHttpOptions,
): Effect.Effect<CycleMcpHttpServerHandle, unknown, NodeServices.NodeServices> =>
  Effect.gen(function* () {
    const host = options.host ?? "127.0.0.1";
    assertLoopback(host);

    const scope = yield* Scope.make("sequential");
    const { createServer } = yield* Effect.promise(() => import("node:http"));
    const routes = Layer.mergeAll(
      makeCycleMcpHttpLayer(options),
      HttpRouter.cors({
        allowedMethods: ["POST", "OPTIONS"],
        exposedHeaders: ["x-request-id"],
        maxAge: 86_400,
      }),
    ) as Layer.Layer<never, unknown, any>;
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
      return yield* Effect.die(new Error("Cycle MCP server did not bind to a TCP address."));
    }

    const path = options.path ?? "/mcp";
    const baseUrl = `http://${host}:${server.address.port}`;
    yield* logInfo("mcp", "mcp http server started", {
      baseUrl,
      path,
      port: server.address.port,
    });

    return {
      baseUrl,
      close: () =>
        Effect.runPromise(
          Scope.close(scope, Exit.void).pipe(
            Effect.andThen(logInfo("mcp", "mcp http server stopped", { baseUrl, path })),
            Effect.provide(CycleLoggingLive()),
          ),
        ),
      path,
      port: server.address.port,
      server,
    };
  }) as Effect.Effect<CycleMcpHttpServerHandle, unknown, NodeServices.NodeServices>;

const withUserAgent = <A extends CycleMcpOptions>(
  options: A,
): A & { readonly userAgent: string } => ({
  ...options,
  userAgent: `cycle-mcp/${options.version ?? "0.0.0"}`,
});

const httpCompatibilityLayer = (
  options: CycleMcpHttpOptions,
): Layer.Layer<never, unknown, HttpRouter.HttpRouter> => {
  const token = mcpHttpToken(options);
  if (options.auth !== false && (token === undefined || token.length === 0)) {
    return Layer.effectDiscard(
      logWarning("mcp", "mcp http auth token missing").pipe(
        Effect.andThen(Effect.fail(new Error("Cycle MCP HTTP auth requires a bearer token."))),
      ),
    );
  }

  return HttpRouter.middleware(
    HttpMiddleware.make((httpEffect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        if (requestPathname(request) !== (options.path ?? "/mcp")) {
          return yield* httpEffect;
        }

        if (request.method === "OPTIONS") {
          return HttpServerResponse.empty({
            headers: mcpCorsPreflightHeaders(request),
          });
        }

        if (options.auth !== false && request.headers.authorization !== `Bearer ${token}`) {
          return HttpServerResponse.jsonUnsafe(
            {
              error: {
                code: "UNAUTHORIZED",
                message: "Missing or invalid MCP credentials.",
                retryable: false,
              },
            },
            {
              headers: mcpCorsHeaders,
              status: 401,
            },
          );
        }

        const response = yield* mcpStatelessCompatibilityResponse(request, options.path ?? "/mcp");
        if (response !== undefined) return response;

        return yield* httpEffect;
      }),
    ),
    { global: true },
  );
};

const mcpStatelessCompatibilityResponse = (
  request: HttpServerRequest.HttpServerRequest,
  path: string,
): Effect.Effect<HttpServerResponse.HttpServerResponse | undefined> =>
  Effect.gen(function* () {
    if (request.method !== "POST") return undefined;
    if (requestPathname(request) !== path) return undefined;
    if (request.headers["mcp-session-id"] !== undefined) return undefined;

    const payload = yield* readCachedJson(request);
    if (!isJsonRpcObject(payload)) return undefined;

    switch (payload.method) {
      case "ping":
        return jsonRpcResult(payload.id, {});
      case "tools/list":
        return jsonRpcResult(payload.id, {
          tools: cycleMcpTools.map((tool) => mcpToolFromDefinition(tool)),
        });
      default:
        return undefined;
    }
  });

const readCachedJson = (
  request: HttpServerRequest.HttpServerRequest,
): Effect.Effect<unknown | undefined> =>
  request.json.pipe(Effect.catch(() => Effect.succeed(undefined)));

const jsonRpcResult = (
  id: JsonRpcId | undefined,
  result: unknown,
): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.jsonUnsafe(
    {
      id: id ?? null,
      jsonrpc: "2.0",
      result,
    },
    {
      headers: mcpCorsHeaders,
    },
  );

const mcpCorsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-expose-headers": "x-request-id",
} as const;

const mcpCorsPreflightHeaders = (
  request: HttpServerRequest.HttpServerRequest,
): Readonly<Record<string, string>> => ({
  ...mcpCorsHeaders,
  "access-control-allow-headers":
    request.headers["access-control-request-headers"] ?? "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-max-age": "86400",
});

type JsonRpcId = string | number | null;

const isJsonRpcObject = (
  value: unknown,
): value is {
  readonly id?: JsonRpcId;
  readonly method: string;
} =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  "method" in value &&
  typeof value.method === "string" &&
  (!("id" in value) ||
    value.id === null ||
    typeof value.id === "string" ||
    typeof value.id === "number");

const requestPathname = (request: HttpServerRequest.HttpServerRequest): string =>
  new URL(request.originalUrl, "http://cycle.local").pathname;

const mcpHttpToken = (options: CycleMcpHttpOptions): string | undefined => {
  if (options.auth !== undefined && options.auth !== false) return options.auth.token;

  return options.env.CYCLE_MCP_TOKEN ?? options.apiToken ?? options.env.CYCLE_API_TOKEN;
};

const assertLoopback = (host: string): void => {
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error("Cycle MCP server can only bind to a loopback host.");
  }
};
