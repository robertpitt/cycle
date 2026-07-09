import { Schema } from "effect";
import { AgentArtifact } from "./AgentArtifact.ts";
import { AgentAttempt } from "./AgentAttempt.ts";
import { AgentInteraction } from "./AgentInteraction.ts";
import { AgentMessage } from "./AgentMessage.ts";
import { AgentRun } from "./AgentRun.ts";
import { AgentTask } from "./AgentTask.ts";
import { AgentThread } from "./AgentThread.ts";
import { AgentWorkflowStep } from "./AgentWorkflowStep.ts";

export class AgentThreadSnapshot extends Schema.Class<AgentThreadSnapshot>(
  "@cycle/agents/AgentThreadSnapshot",
)({
  artifacts: Schema.Array(AgentArtifact),
  interactions: Schema.Array(AgentInteraction),
  lastSequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  messages: Schema.Array(AgentMessage),
  tasks: Schema.Array(AgentTask),
  thread: AgentThread,
}) {}

export class AgentTaskSnapshot extends Schema.Class<AgentTaskSnapshot>(
  "@cycle/agents/AgentTaskSnapshot",
)({
  artifacts: Schema.Array(AgentArtifact),
  attempts: Schema.Array(AgentAttempt),
  interactions: Schema.Array(AgentInteraction),
  lastSequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  runs: Schema.Array(AgentRun),
  task: AgentTask,
  workflowSteps: Schema.Array(AgentWorkflowStep),
}) {}
