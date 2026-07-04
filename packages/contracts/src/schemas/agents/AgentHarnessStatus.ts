import { Schema } from "effect";

export const AgentHarnessStatus = Schema.Literals([
  "available",
  "missing",
  "degraded",
  "disabled",
  "unsupported",
]).pipe(
  Schema.annotate({
    description: "Availability state for an installed provider harness.",
    identifier: "@cycle/contracts/AgentHarnessStatus",
    title: "AgentHarnessStatus",
  }),
);
export type AgentHarnessStatus = typeof AgentHarnessStatus.Type;
