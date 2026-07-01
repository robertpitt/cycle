import { makeCodexAgentService } from "../providers/codex/service.ts";
import type { CodexAgentServiceOptions } from "../providers/codex/types.ts";
import {
  makeAgentServiceRegistry,
  type AgentServiceRegistryShape,
} from "./AgentServiceRegistry.ts";

export type DefaultAgentServiceRegistryOptions = CodexAgentServiceOptions;

export const makeDefaultAgentServiceRegistry = (
  options: DefaultAgentServiceRegistryOptions = {},
): AgentServiceRegistryShape => {
  const codexService = makeCodexAgentService(options);

  return makeAgentServiceRegistry([{ provider: "codex", service: codexService }]);
};
