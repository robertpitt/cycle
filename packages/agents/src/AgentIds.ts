import { Schema } from "effect";

const makeId = <Brand extends string>(prefix: string, brand: Brand) =>
  Schema.String.check(
    Schema.isPattern(new RegExp(`^${prefix}_[A-Za-z0-9][A-Za-z0-9_-]*$`, "u"), {
      expected: `${prefix} identifier`,
    }),
  ).pipe(Schema.brand(brand));

export const AgentThreadId = makeId("agent_thread", "@cycle/agents/AgentThreadId");
export type AgentThreadId = typeof AgentThreadId.Type;

export const AgentTaskId = makeId("agent_task", "@cycle/agents/AgentTaskId");
export type AgentTaskId = typeof AgentTaskId.Type;

export const AgentTurnId = makeId("agent_turn", "@cycle/agents/AgentTurnId");
export type AgentTurnId = typeof AgentTurnId.Type;

export const AgentMessageId = makeId("agent_message", "@cycle/agents/AgentMessageId");
export type AgentMessageId = typeof AgentMessageId.Type;

export const AgentRunId = makeId("agent_run", "@cycle/agents/AgentRunId");
export type AgentRunId = typeof AgentRunId.Type;

export const AgentAttemptId = makeId("agent_attempt", "@cycle/agents/AgentAttemptId");
export type AgentAttemptId = typeof AgentAttemptId.Type;

export const AgentSessionId = makeId("agent_session", "@cycle/agents/AgentSessionId");
export type AgentSessionId = typeof AgentSessionId.Type;

export const AgentInteractionId = makeId("agent_interaction", "@cycle/agents/AgentInteractionId");
export type AgentInteractionId = typeof AgentInteractionId.Type;

export const AgentEventId = makeId("agent_event", "@cycle/agents/AgentEventId");
export type AgentEventId = typeof AgentEventId.Type;

export const AgentWorkflowStepId = makeId("agent_step", "@cycle/agents/AgentWorkflowStepId");
export type AgentWorkflowStepId = typeof AgentWorkflowStepId.Type;

export const AgentOperationId = makeId("agent_operation", "@cycle/agents/AgentOperationId");
export type AgentOperationId = typeof AgentOperationId.Type;

export const AgentArtifactId = makeId("agent_artifact", "@cycle/agents/AgentArtifactId");
export type AgentArtifactId = typeof AgentArtifactId.Type;

export const AgentCommandId = makeId("agent_command", "@cycle/agents/AgentCommandId");
export type AgentCommandId = typeof AgentCommandId.Type;
