import { Context, Effect, Layer } from "effect";
import type { AgentProviderId, AgentService } from "../types.ts";
import { makeUnsupportedAgentService } from "./UnsupportedAgentService.ts";

export type AgentServiceRegistryShape = {
  readonly serviceFor: (provider: AgentProviderId) => Effect.Effect<AgentService>;
};

export type AgentServiceEntry = {
  readonly provider: AgentProviderId;
  readonly service: AgentService;
};

export class AgentServiceRegistry extends Context.Service<
  AgentServiceRegistry,
  AgentServiceRegistryShape
>()("@cycle/agents/AgentServiceRegistry") {}

export const makeAgentServiceRegistry = (
  entries: readonly AgentServiceEntry[],
  fallback?: (provider: AgentProviderId) => AgentService,
): AgentServiceRegistryShape => {
  const services = new Map(entries.map((entry) => [entry.provider, entry.service]));

  return {
    serviceFor: (provider) =>
      Effect.succeed(
        services.get(provider) ?? fallback?.(provider) ?? makeUnsupportedAgentService(provider),
      ),
  };
};

export const AgentServiceRegistryLive = (
  entries: readonly AgentServiceEntry[],
  fallback?: (provider: AgentProviderId) => AgentService,
) =>
  Layer.succeed(
    AgentServiceRegistry,
    AgentServiceRegistry.of(makeAgentServiceRegistry(entries, fallback)),
  );

export const AgentServiceRegistryTest = AgentServiceRegistryLive;

export const UnsupportedAgentServiceRegistryLive = Layer.succeed(
  AgentServiceRegistry,
  AgentServiceRegistry.of({
    serviceFor: (provider) => Effect.succeed(makeUnsupportedAgentService(provider)),
  }),
);
