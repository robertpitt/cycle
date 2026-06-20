import { Context, Effect, Layer } from "effect";
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
  Layer.effectDiscard(registerCycleMcpTools);

const makeRequestId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};
