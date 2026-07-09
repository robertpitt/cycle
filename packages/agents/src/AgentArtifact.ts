import { Schema } from "effect";
import { AgentTimestamp } from "./AgentCommon.ts";
import { AgentArtifactId, AgentRunId, AgentTaskId, AgentThreadId } from "./AgentIds.ts";
import { AgentVisibility } from "./AgentMessage.ts";

export const AgentArtifactRetention = Schema.Literals(["thread", "debug-30d", "diagnostic-7d"]);
export type AgentArtifactRetention = typeof AgentArtifactRetention.Type;

export class AgentArtifact extends Schema.Class<AgentArtifact>("@cycle/agents/AgentArtifact")({
  artifactId: AgentArtifactId,
  contentDigest: Schema.optional(Schema.String),
  createdAt: AgentTimestamp,
  kind: Schema.String,
  mediaType: Schema.optional(Schema.String),
  pathOrUri: Schema.String,
  retention: AgentArtifactRetention,
  runId: Schema.optional(AgentRunId),
  size: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  taskId: Schema.optional(AgentTaskId),
  threadId: AgentThreadId,
  visibility: AgentVisibility,
}) {}
