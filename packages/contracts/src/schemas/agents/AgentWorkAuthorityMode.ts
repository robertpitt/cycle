import { Schema } from "effect";

export const AgentWorkAuthorityMode = Schema.Literals([
  "ticket-context",
  "disposable-worktree",
  "implementation-worktree",
]).pipe(
  Schema.annotate({
    description: "Authority and workspace mode granted to an Agent Work job.",
    identifier: "@cycle/contracts/AgentWorkAuthorityMode",
    title: "AgentWorkAuthorityMode",
  }),
);
export type AgentWorkAuthorityMode = typeof AgentWorkAuthorityMode.Type;
