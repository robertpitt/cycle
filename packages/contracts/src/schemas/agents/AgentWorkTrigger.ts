import { Schema } from "effect";

export const AgentWorkTrigger = Schema.Literals([
  "assignment-pickup",
  "agent-delegate",
  "agent-mention",
  "follow-up-implementation",
  "manual-command",
  "retry",
  "resume",
]).pipe(
  Schema.annotate({
    description: "Reason an Agent Work job was created.",
    identifier: "@cycle/contracts/AgentWorkTrigger",
    title: "AgentWorkTrigger",
  }),
);
export type AgentWorkTrigger = typeof AgentWorkTrigger.Type;
