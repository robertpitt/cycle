import type { AgentProviderId } from "./AgentProviderId.ts";

export type AgentProviderDefinition = {
  readonly capabilities?: unknown;
  readonly configurationSchema?: unknown;
  readonly defaultEnabled?: boolean;
  readonly defaultMaxConcurrentRuns?: number | null;
  readonly executable: string;
  readonly id: AgentProviderId;
  readonly name: string;
  readonly packageName?: string;
};

export const supportedAgentProviders: ReadonlyArray<AgentProviderDefinition> = [
  {
    defaultEnabled: true,
    defaultMaxConcurrentRuns: null,
    executable: "codex",
    id: "codex",
    name: "Codex",
  },
  {
    defaultEnabled: true,
    defaultMaxConcurrentRuns: null,
    executable: "claude",
    id: "claude-code",
    name: "Claude Code",
  },
] as const satisfies readonly AgentProviderDefinition[];

export const isAgentProviderId = (value: unknown): value is AgentProviderId =>
  supportedAgentProviders.some((provider) => provider.id === value);
