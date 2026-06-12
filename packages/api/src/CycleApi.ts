import { makeCycleMcpHttpLayer, type CycleMcpHttpOptions } from "@cycle/mcp/server";
import { NodeServices } from "@effect/platform-node";
import { Layer } from "effect";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { CycleHttpApi, makeOpenApiDocument } from "./api.ts";
import { CycleAuthorizationLive } from "./http/handlers/Authorization.ts";
import { SystemApiHandlers } from "./http/handlers/System.ts";
import { V1ApiHandlers } from "./http/handlers/V1.ts";
import {
  CycleApiRuntime,
  type ApiConfig,
  type CycleApiMcpOptions,
  type ApiRequestContext,
  type CycleApi,
  type CycleApiOptions,
  type CycleApiRuntimeShape,
  type RepositoryOpenInputResolver,
  type RepositoryOpenRequest,
  type RuntimeDiscoveryFile,
} from "./http/runtime/CycleApiRuntime.ts";

export {
  CycleApiRuntime,
  type ApiConfig,
  type ApiRequestContext,
  type CycleApi,
  type CycleApiMcpOptions,
  type CycleApiOptions,
  type CycleApiRuntimeShape,
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
  const runtime = Layer.succeed(CycleApiRuntime, {
    apiVersion: options.apiVersion ?? "0.1.0",
    now: options.now ?? (() => new Date()),
    ...(options.repositoryOpenInput === undefined
      ? {}
      : { repositoryOpenInput: options.repositoryOpenInput }),
    runner: options.runner,
    startedAt: (options.startedAt ?? new Date()).toISOString(),
    staticToken: options.staticToken,
  });
  const handlers = Layer.mergeAll(SystemApiHandlers, V1ApiHandlers).pipe(
    Layer.provide(CycleAuthorizationLive),
    Layer.provide(runtime),
  );
  const apiLayer = HttpApiBuilder.layer(CycleHttpApi, {
    openapiPath: "/spec.json",
  }).pipe(Layer.provide(handlers)) as Layer.Layer<never, never, any>;
  const mcpLayer = makeHostedMcpLayer(options);
  const corsLayer = HttpRouter.cors({
    allowedMethods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    exposedHeaders: ["x-request-id"],
    maxAge: 86_400,
  });

  return Layer.mergeAll(apiLayer, mcpLayer, corsLayer) as Layer.Layer<never, unknown, any>;
};

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
    token: mcp.auth?.token ?? mcp.apiToken ?? staticToken,
  };
};
