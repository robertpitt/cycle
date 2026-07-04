import { Schema } from "effect";

export const AgentWorkJobStatus = Schema.Literals([
  "queued",
  "starting",
  "running",
  "waiting-for-input",
  "suspending",
  "suspended",
  "resuming",
  "retry-wait",
  "cancelling",
  "completed",
  "failed",
  "cancelled",
]).pipe(
  Schema.annotate({
    description: "Lifecycle status for an Agent Work job.",
    identifier: "@cycle/contracts/AgentWorkJobStatus",
    title: "AgentWorkJobStatus",
  }),
);
export type AgentWorkJobStatus = typeof AgentWorkJobStatus.Type;
