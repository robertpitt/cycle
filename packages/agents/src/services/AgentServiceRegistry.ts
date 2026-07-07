import { Context, Effect, Layer } from "effect";
import type { AgentProviderId, AgentService } from "../types.ts";

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
): AgentServiceRegistryShape => {
  const services = new Map(entries.map((entry) => [entry.provider, entry.service]));

  return {
    serviceFor: (provider) => {
      const service = services.get(provider);
      return service === undefined
        ? Effect.die(new Error(`Agent provider '${provider}' is not registered.`))
        : Effect.succeed(service);
    },
  };
};

export const AgentServiceRegistryLive = (entries: readonly AgentServiceEntry[]) =>
  Layer.succeed(AgentServiceRegistry, AgentServiceRegistry.of(makeAgentServiceRegistry(entries)));
