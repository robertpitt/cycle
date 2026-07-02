export * from "./codex-harness.ts";
export * from "./contracts.ts";
export * from "./durability.ts";
export * from "./events.ts";
export * from "./harness.ts";
export * from "./policy.ts";
export * from "./prompt.ts";
export * from "./service.ts";

import { Layer } from "effect";
import type { CodexAgentServiceOptions } from "../providers/codex/types.ts";
import { makeClaudeCodeHarnessAdapter } from "../providers/claude-code/harness.ts";
import type { ClaudeCodeAgentServiceOptions } from "../providers/claude-code/service.ts";
import { makeCodexHarnessAdapter } from "./codex-harness.ts";
import { AgentDurabilityInMemory } from "./durability.ts";
import { AgentHarnessRegistryLive } from "./harness.ts";
import { AgentAuthorityPolicyLive, AgentMcpConnectorLive } from "./policy.ts";
import { PromptAssemblerLive, PromptTemplateRegistryLive } from "./prompt.ts";
import { AgentRuntimeLive, type AgentRuntimeOptions } from "./service.ts";

export type DefaultAgentRuntimeLayerOptions = {
  readonly claudeCode?: ClaudeCodeAgentServiceOptions;
  readonly codex?: CodexAgentServiceOptions;
  readonly config?: AgentRuntimeOptions["config"];
  readonly makeId?: (prefix: string) => string;
  readonly now?: () => Date;
};

export const AgentRuntimeDefault = (options: DefaultAgentRuntimeLayerOptions = {}) => {
  const now = options.now ?? (() => new Date());
  const makeId = options.makeId ?? defaultId;

  return AgentRuntimeLive({
    config: options.config,
    makeId,
    now,
  }).pipe(
    Layer.provide([
      AgentAuthorityPolicyLive,
      AgentDurabilityInMemory,
      AgentHarnessRegistryLive([
        makeCodexHarnessAdapter(options.codex),
        makeClaudeCodeHarnessAdapter(options.claudeCode),
      ]),
      AgentMcpConnectorLive,
      PromptAssemblerLive({ makeId, now }),
      PromptTemplateRegistryLive,
    ]),
  );
};

const defaultId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
