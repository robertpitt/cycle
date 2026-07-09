import { makeClaudeCodeAgentService } from "./providers/claude-code/service.ts";
import type { ClaudeCodeAgentServiceOptions } from "./providers/claude-code/service.ts";
import { makeCodexAgentService } from "./providers/codex/service.ts";
import type { CodexAgentServiceOptions } from "./providers/codex/types.ts";
import {
  makeAgentServiceRegistry,
  type AgentServiceRegistryShape,
} from "./AgentServiceRegistry.ts";

export type DefaultAgentServiceRegistryOptions = CodexAgentServiceOptions & {
  readonly claudeCode?: ClaudeCodeAgentServiceOptions;
};

export const makeDefaultAgentServiceRegistry = (
  options: DefaultAgentServiceRegistryOptions = {},
): AgentServiceRegistryShape => {
  const codexService = makeCodexAgentService(options);
  const claudeCodeService = makeClaudeCodeAgentService({
    ...options.claudeCode,
    env: options.env,
  });

  return makeAgentServiceRegistry([
    { provider: "codex", service: codexService },
    { provider: "claude-code", service: claudeCodeService },
  ]);
};
