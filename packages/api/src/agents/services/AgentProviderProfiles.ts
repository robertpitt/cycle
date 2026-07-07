import { detectAgentProviders } from "@cycle/agents/detection";
import { agentProviderProfileFromDetection } from "@cycle/agents/providers";
import type { AgentProviderProfile } from "@cycle/agents/types";
import { Context, Effect, Layer } from "effect";

export type AgentProviderProfilesShape = {
  readonly list: () => Promise<readonly AgentProviderProfile[]>;
};

export class AgentProviderProfiles extends Context.Service<
  AgentProviderProfiles,
  AgentProviderProfilesShape
>()("@cycle/api/AgentProviderProfiles") {}

export const listLocalAgentProviderProfiles = async (): Promise<
  readonly AgentProviderProfile[]
> => {
  const detected = await Effect.runPromise(detectAgentProviders(process.env));

  return detected.map(agentProviderProfileFromDetection);
};

export const makeAgentProviderProfiles = (
  list: () => Promise<readonly AgentProviderProfile[]> = listLocalAgentProviderProfiles,
): AgentProviderProfilesShape => ({ list });

export const AgentProviderProfilesLive = Layer.succeed(
  AgentProviderProfiles,
  AgentProviderProfiles.of(makeAgentProviderProfiles()),
);
