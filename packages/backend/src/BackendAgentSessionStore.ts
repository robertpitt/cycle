import type { AgentSessionStore } from "@cycle/agents";
import { Context, Layer } from "effect";
import { makeBackendAgentSessionStore } from "./internals/agentSessionStore.ts";

export class BackendAgentSessionStore extends Context.Service<
  BackendAgentSessionStore,
  AgentSessionStore
>()("@cycle/backend/BackendAgentSessionStore") {}

export const BackendAgentSessionStoreLive = (path: string) =>
  Layer.sync(BackendAgentSessionStore, () =>
    BackendAgentSessionStore.of(makeBackendAgentSessionStore(path)),
  );

export const BackendAgentSessionStoreTest = (store: AgentSessionStore) =>
  Layer.succeed(BackendAgentSessionStore, BackendAgentSessionStore.of(store));

export { makeBackendAgentSessionStore };
export type { AgentSessionBinding, AgentSessionStore } from "@cycle/agents";
