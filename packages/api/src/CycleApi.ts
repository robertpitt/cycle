import { UseCaseServicesLive } from "@cycle/usecases";
import { NodeServices } from "@effect/platform-node";
import { Layer } from "effect";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { CycleHttpApi, makeOpenApiDocument } from "./http/CycleHttpApi.ts";
import { SystemApiHandlers } from "./http/handlers/System.ts";
import { V1ApiHandlers } from "./http/handlers/V1.ts";
import { makeAgentTaskWebSocketLayer } from "./http/handlers/v1/agentTasksWs.ts";
import { makeChatWebSocketLayer } from "./http/handlers/v1/chat/ws.ts";
import { CycleAuthorizationLive } from "./http/middleware/CycleAuthorization.ts";
import { CycleApiTracingLive } from "./http/middleware/CycleApiTracing.ts";
import { CycleRequestContextLive } from "./http/middleware/CycleRequestContextMiddleware.ts";
import { FrameworkErrorEnvelopeLive } from "./http/middleware/FrameworkErrorEnvelope.ts";
import {
  CycleApiRuntime,
  type CycleApiMcpOptions,
  type CycleApi,
  type CycleApiOptions,
  type CycleApiRuntimeShape,
} from "./http/runtime/CycleApiRuntime.ts";
import { makeCycleMcpHttpLayer, type CycleMcpHttpOptions } from "./mcp/server/index.ts";

export const makeCycleApi = (options: CycleApiOptions): CycleApi => {
  const appLayer = (makeCycleApiLayer(options) as Layer.Layer<never, unknown, any>).pipe(
    Layer.provide([HttpServer.layerServices, NodeServices.layer]),
  );
  const { dispose, handler } = HttpRouter.toWebHandler(appLayer as any, {
    disableLogger: true,
  });

  return {
    dispose,
    fetch: handler as (request: Request) => Promise<Response>,
    spec: makeOpenApiDocument,
  };
};

export const makeCycleApiLayer = (options: CycleApiOptions) => {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const mcpPath = hostedMcpPath(options.mcp);
  const mcpUrl =
    baseUrl === undefined || mcpPath === undefined ? undefined : joinBaseUrlPath(baseUrl, mcpPath);
  const useCaseLayer = Layer.mergeAll(UseCaseServicesLive, options.useCaseLayer ?? Layer.empty);
  const listAgentProviderProfiles = async () => {
    const profiles = await (options.agentProviderProfiles ?? (async () => []))();
    return profiles;
  };
  const runtimeShape: CycleApiRuntimeShape = {
    ...(options.agentChat === undefined ? {} : { agentChat: options.agentChat }),
    agentProviderProfiles: listAgentProviderProfiles,
    ...(options.assignTicketToAgent === undefined
      ? {}
      : { assignTicketToAgent: options.assignTicketToAgent }),
    apiVersion: options.apiVersion ?? "0.1.0",
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(options.listRepositories === undefined
      ? {}
      : { listRepositories: options.listRepositories }),
    ...(options.localSettings === undefined ? {} : { localSettings: options.localSettings }),
    ...(mcpPath === undefined ? {} : { mcpPath }),
    ...(mcpUrl === undefined ? {} : { mcpUrl }),
    now: options.now ?? (() => new Date()),
    ...(options.onUseCaseSuccess === undefined
      ? {}
      : { onUseCaseSuccess: options.onUseCaseSuccess }),
    startedAt: (options.startedAt ?? new Date()).toISOString(),
    staticToken: options.staticToken,
    useCaseLayer,
    ...(options.worktrees === undefined ? {} : { worktrees: options.worktrees }),
    ...(options.worktreeStoragePath === undefined
      ? {}
      : { worktreeStoragePath: options.worktreeStoragePath }),
  };
  const runtime = Layer.succeed(CycleApiRuntime, CycleApiRuntime.of(runtimeShape));
  const handlers = V1ApiHandlers.pipe(
    Layer.provideMerge(SystemApiHandlers),
    Layer.provide(CycleAuthorizationLive),
    Layer.provide(CycleApiTracingLive),
    Layer.provide(CycleRequestContextLive),
    Layer.provide(runtime),
  );
  const apiLayer = HttpApiBuilder.layer(CycleHttpApi).pipe(Layer.provide(handlers)) as Layer.Layer<
    never,
    never,
    any
  >;
  const mcpLayer = makeHostedMcpLayer(options);
  const agentTaskWebSocketLayer = makeAgentTaskWebSocketLayer(runtimeShape);
  const chatWebSocketLayer = makeChatWebSocketLayer(runtimeShape);
  const corsLayer = HttpRouter.cors({
    allowedMethods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    exposedHeaders: ["x-cycle-stream-version", "x-request-id"],
    maxAge: 86_400,
  });

  return Layer.mergeAll(
    apiLayer,
    mcpLayer,
    agentTaskWebSocketLayer,
    chatWebSocketLayer,
    corsLayer,
    FrameworkErrorEnvelopeLive,
  ) as Layer.Layer<never, unknown, any>;
};

const hostedMcpPath = (mcp: false | CycleApiMcpOptions | undefined): string | undefined => {
  if (mcp === false || mcp === undefined || mcp.enabled === false) return undefined;
  return mcp.path ?? "/mcp";
};

const normalizeBaseUrl = (baseUrl: string | undefined): string | undefined =>
  baseUrl === undefined ? undefined : baseUrl.replace(/\/+$/u, "");

const joinBaseUrlPath = (baseUrl: string, path: string): string =>
  `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

const normalizeMcpToken = (mcp: CycleApiMcpOptions, staticToken: string): string =>
  mcp.auth !== false && mcp.auth?.token !== undefined
    ? mcp.auth.token
    : (mcp.apiToken ?? staticToken);

const makeHostedMcpLayer = (options: CycleApiOptions): Layer.Layer<never, unknown, any> => {
  const mcp = options.mcp;
  if (mcp === false || mcp === undefined || mcp.enabled === false) return Layer.empty;

  return makeCycleMcpHttpLayer({
    apiToken: mcp.apiToken ?? options.staticToken,
    apiUrl: mcp.apiUrl,
    auth: normalizeMcpAuth(mcp, options.staticToken),
    env: mcp.env ?? process.env,
    name: "cycle",
    path: mcp.path ?? "/mcp",
    requireApiOnStart: mcp.requireApiOnStart ?? false,
    version: options.apiVersion ?? "0.1.0",
  } satisfies CycleMcpHttpOptions) as Layer.Layer<never, unknown, any>;
};

const normalizeMcpAuth = (
  mcp: CycleApiMcpOptions,
  staticToken: string,
): CycleMcpHttpOptions["auth"] => {
  if (mcp.auth === false) return false;
  return {
    token: normalizeMcpToken(mcp, staticToken),
  };
};
