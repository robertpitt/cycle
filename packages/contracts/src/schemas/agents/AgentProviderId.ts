import { Schema } from "effect";

export const AgentProviderId = Schema.Literals(["codex", "claude-code"]).pipe(
  Schema.annotate({
    description: "Supported external agent provider id.",
    identifier: "@cycle/contracts/AgentProviderId",
    title: "AgentProviderId",
  }),
);
export type AgentProviderId = typeof AgentProviderId.Type;
