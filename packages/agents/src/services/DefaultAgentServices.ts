import { makeCodexAgentService } from "../providers/codex/service.ts";
import type { CodexAgentServiceOptions } from "../providers/codex/types.ts";
import type { AgentSessionStore } from "../types.ts";
import {
  makeAgentServiceRegistry,
  type AgentServiceRegistryShape,
} from "./AgentServiceRegistry.ts";
import { makeUnsupportedAgentService } from "./UnsupportedAgentService.ts";

export type DefaultAgentServiceRegistryOptions = CodexAgentServiceOptions & {
  readonly sessionStore?: AgentSessionStore;
};

export const makeDefaultAgentServiceRegistry = (
  options: DefaultAgentServiceRegistryOptions = {},
): AgentServiceRegistryShape => {
  const codexService = makeCodexAgentService(options);

  return makeAgentServiceRegistry([{ provider: "codex", service: codexService }], (provider) =>
    makeUnsupportedAgentService(provider, { sessionStore: options.sessionStore }),
  );
};
