import { Context, Effect, Layer } from "effect";
import { Schema } from "effect";
import * as ContractSchemas from "@cycle/contracts/schemas";
import * as McpServer from "effect/unstable/ai/McpServer";
import { CycleMcpApiClient } from "../client.ts";
import {
  callCycleMcpTool,
  callToolResultFrom,
  cycleMcpTools,
  mcpToolFromDefinition,
} from "./registry.ts";

export const registerCycleMcpTools: Effect.Effect<
  void,
  never,
  McpServer.McpServer | CycleMcpApiClient
> = Effect.gen(function* () {
  const registry = yield* McpServer.McpServer;
  const api = yield* CycleMcpApiClient;

  for (const definition of cycleMcpTools) {
    yield* registry.addTool({
      annotations: Context.empty(),
      handle: (payload) =>
        callCycleMcpTool(definition.name, payload, {
          api,
          makeRequestId,
        }).pipe(Effect.map(callToolResultFrom)),
      tool: mcpToolFromDefinition(definition),
    });
  }
});

export const CycleMcpToolsLive: Layer.Layer<never, never, McpServer.McpServer | CycleMcpApiClient> =
  Layer.mergeAll(
    Layer.effectDiscard(registerCycleMcpTools),
    Layer.effectDiscard(registerCycleMcpResources),
  );

export const registerCycleMcpResources: Effect.Effect<
  void,
  never,
  McpServer.McpServer | CycleMcpApiClient
> = Effect.gen(function* () {
  const api = yield* CycleMcpApiClient;
  const pagePath = (repositoryId: string, pageId: string): string =>
    `/v1/repositories/${encodeURIComponent(repositoryId)}/pages/${encodeURIComponent(pageId)}`;
  const content = (method: string, path: string) =>
    api.request({ method, path }).pipe(Effect.map((envelope) => JSON.stringify(envelope)));

  yield* McpServer.registerResource`cycle://repository/${Schema.String}/pages/${ContractSchemas.PageId}`(
    {
      content: (_uri, repositoryId, pageId) =>
        content("GET", `${pagePath(repositoryId, pageId)}?includeArchived=true`),
      description: "Current Cycle Page document by stable Page id.",
      mimeType: "application/json",
      name: "Cycle Page",
    },
  );
  yield* McpServer.registerResource`cycle://repository/${Schema.String}/pages/${ContractSchemas.PageId}/comments`(
    {
      content: (_uri, repositoryId, pageId) =>
        content("GET", `${pagePath(repositoryId, pageId)}/comments`),
      description: "Comments targeting a Cycle Page.",
      mimeType: "application/json",
      name: "Cycle Page comments",
    },
  );
  yield* McpServer.registerResource`cycle://repository/${Schema.String}/pages/${ContractSchemas.PageId}/history`(
    {
      content: (_uri, repositoryId, pageId) =>
        content("GET", `${pagePath(repositoryId, pageId)}/history`),
      description: "Lifecycle history for a Cycle Page.",
      mimeType: "application/json",
      name: "Cycle Page history",
    },
  );
});

const makeRequestId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};
