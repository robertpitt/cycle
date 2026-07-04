import { mcpBearerTokenEnvVar } from "@cycle/agents";
import { makeAgentOrchestrationService } from "@cycle/agents/orchestration";
import { makeDefaultAgentServiceRegistry } from "@cycle/agents/service";
import { UseCaseServicesLive } from "@cycle/usecases";
import { NodeServices } from "@effect/platform-node";
import { Layer } from "effect";
import { HttpRouter, HttpServer, HttpServerResponse } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import {
  makeAgentActiveTurnDirectory,
  type AgentActiveTurnDirectoryShape,
} from "./agents/services/AgentActiveTurnDirectory.ts";
import { listLocalAgentProviderProfiles } from "./agents/services/AgentProviderProfiles.ts";
import { CycleHttpApi, makeOpenApiDocument } from "./api.ts";
import { CycleAuthorizationLive } from "./http/handlers/Authorization.ts";
import { FrameworkErrorEnvelopeLive } from "./http/handlers/FrameworkErrors.ts";
import { SystemApiHandlers } from "./http/handlers/System.ts";
import { V1ApiHandlers } from "./http/handlers/V1.ts";
import { makeAgentTaskWebSocketLayer } from "./http/handlers/v1/agentTasksWs.ts";
import { makeChatWebSocketLayer } from "./http/handlers/v1/chat/ws.ts";
import { CycleApiTracingLive } from "./http/tracing.ts";
import {
  CycleApiRuntime,
  type AgentChatActivityRecord,
  type AgentChatEventRecord,
  type AgentChatMessageRecord,
  type AgentChatQuestionItemRecord,
  type AgentChatQuestionRecord,
  type AgentChatStoreShape,
  type AgentChatThreadRecord,
  type AgentChatThreadWithMessages,
  type AgentChatTurnRecord,
  type ApiConfig,
  type CycleApiMcpOptions,
  type ApiRequestContext,
  type CycleApi,
  type CycleApiOptions,
  type CycleApiRuntimeShape,
  type RepositoryDirectoryEntry,
  type RepositoryDirectoryResolver,
  type RepositoryOpenInputResolver,
  type RepositoryOpenRequest,
  type RuntimeDiscoveryFile,
} from "./http/runtime/CycleApiRuntime.ts";
import { makeCycleMcpHttpLayer, type CycleMcpHttpOptions } from "./mcp/server/index.ts";

export {
  CycleApiRuntime,
  type AgentActiveTurnDirectoryShape,
  type AgentChatActivityRecord,
  type AgentChatEventRecord,
  type AgentChatMessageRecord,
  type AgentChatQuestionItemRecord,
  type AgentChatQuestionRecord,
  type AgentChatStoreShape,
  type AgentChatThreadRecord,
  type AgentChatThreadWithMessages,
  type AgentChatTurnRecord,
  type ApiConfig,
  type ApiRequestContext,
  type CycleApi,
  type CycleApiMcpOptions,
  type CycleApiOptions,
  type CycleApiRuntimeShape,
  type RepositoryDirectoryEntry,
  type RepositoryDirectoryResolver,
  type RepositoryOpenInputResolver,
  type RepositoryOpenRequest,
  type RuntimeDiscoveryFile,
};

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
  const agentServiceEnv = agentServiceEnvFromMcp(options.mcp, options.staticToken);
  const activeAgentTurns = makeAgentActiveTurnDirectory();
  const agentServices =
    options.agentServices ??
    makeDefaultAgentServiceRegistry({
      ...(agentServiceEnv === undefined ? {} : { env: agentServiceEnv }),
      sessionStore: options.agentSessionStore,
    });
  const agentOrchestration =
    options.agentOrchestration ??
    makeAgentOrchestrationService({
      agentServices,
      now: options.now,
    });
  const listAgentProviderProfiles = async () => {
    const profiles = await (options.agentProviderProfiles ?? listLocalAgentProviderProfiles)();
    return profiles.map((profile) => ({
      ...profile,
      activeRunCount: activeAgentTurns.countByProvider(profile.provider),
    }));
  };
  const runtimeShape: CycleApiRuntimeShape = {
    activeAgentTurns,
    agentOrchestration,
    agentProviderProfiles: listAgentProviderProfiles,
    agentServices,
    ...(options.agentChatStore === undefined ? {} : { agentChatStore: options.agentChatStore }),
    ...(options.agentSessionStore === undefined
      ? {}
      : { agentSessionStore: options.agentSessionStore }),
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
    ...(options.repositoryOpenInput === undefined
      ? {}
      : { repositoryOpenInput: options.repositoryOpenInput }),
    startedAt: (options.startedAt ?? new Date()).toISOString(),
    staticToken: options.staticToken,
    useCaseLayer,
    ...(options.worktreeService === undefined ? {} : { worktreeService: options.worktreeService }),
    ...(options.worktreeStoragePath === undefined
      ? {}
      : { worktreeStoragePath: options.worktreeStoragePath }),
  };
  const runtime = Layer.succeed(CycleApiRuntime, runtimeShape);
  const handlers = V1ApiHandlers.pipe(
    Layer.provideMerge(SystemApiHandlers),
    Layer.provide(CycleAuthorizationLive),
    Layer.provide(CycleApiTracingLive),
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
    apiDocsLayer,
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

const agentServiceEnvFromMcp = (
  mcp: false | CycleApiMcpOptions | undefined,
  staticToken: string,
): NodeJS.ProcessEnv | undefined => {
  if (mcp === false || mcp === undefined || mcp.enabled === false) return undefined;
  return {
    [mcpBearerTokenEnvVar]:
      mcp.auth === false ? (mcp.apiToken ?? staticToken) : normalizeMcpToken(mcp, staticToken),
  };
};

const normalizeMcpToken = (mcp: CycleApiMcpOptions, staticToken: string): string =>
  mcp.auth !== false && mcp.auth?.token !== undefined
    ? mcp.auth.token
    : (mcp.apiToken ?? staticToken);

const apiDocsLayer = Layer.mergeAll(
  HttpRouter.add(
    "GET",
    "/",
    HttpServerResponse.html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Cycle Local API</title>
    <style>
      body {
        margin: 0;
      }
    </style>
  </head>
  <body>
    <redoc spec-url="/spec.json"></redoc>
    <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
  </body>
</html>`),
  ),
  HttpRouter.add("GET", "/spec.json", HttpServerResponse.jsonUnsafe(makeOpenApiDocument())),
);

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
