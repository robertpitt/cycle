import { Context, Effect } from "effect";
import type { AppConfigError } from "./AppConfig.ts";

export type AgentProviderId = "codex" | "claude" | "opencode";

export type DetectedAgentProvider = {
  readonly detectedAt: string;
  readonly executable: string;
  readonly executablePath?: string;
  readonly id: AgentProviderId;
  readonly name: string;
  readonly status: "available" | "missing";
};

export type AgentProviderDefinition = {
  readonly executable: string;
  readonly id: AgentProviderId;
  readonly name: string;
};

export const supportedAgentProviders: ReadonlyArray<AgentProviderDefinition> = [
  {
    executable: "codex",
    id: "codex",
    name: "Codex",
  },
  {
    executable: "claude",
    id: "claude",
    name: "Claude Code",
  },
  {
    executable: "opencode",
    id: "opencode",
    name: "OpenCode",
  },
];

export type AgentProviderDetectorService = {
  readonly detect: () => Effect.Effect<ReadonlyArray<DetectedAgentProvider>, AppConfigError>;
};

export class AgentProviderDetector extends Context.Service<
  AgentProviderDetector,
  AgentProviderDetectorService
>()("@cycle/desktop/AgentProviderDetector") {}
