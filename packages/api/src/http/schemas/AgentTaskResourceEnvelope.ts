import * as AgentTaskSchemas from "@cycle/contracts/schemas/agents/agent-task-schemas";
import { Schema } from "effect";
import {
  AcceptedResourceEnvelopeOf,
  CollectionEnvelopeOf,
  PositiveInteger,
  ResourceEnvelopeOf,
  strictSchema,
} from "./shared.ts";

export const AgentTaskOutput = AgentTaskSchemas.AgentTask;
export const AgentTaskEventOutput = AgentTaskSchemas.AgentTaskEvent;
export const AgentTaskCreatePayload = AgentTaskSchemas.AgentTaskRequest;
export const AgentTaskCancelPayload = AgentTaskSchemas.CancelAgentTaskInput;
export const AgentTaskRetryPayload = AgentTaskSchemas.RetryAgentTaskInput;
export const AgentTaskInputPayload = AgentTaskSchemas.AgentTaskInput;
export const TicketAgentTaskCreatePayload = strictSchema(
  Schema.Struct({
    agentId: Schema.optional(Schema.String),
    authority: Schema.optional(AgentTaskSchemas.AgentTaskAuthority),
    commandId: Schema.optional(Schema.String),
    idempotencyKey: Schema.optional(Schema.String),
    input: Schema.optional(Schema.Union([Schema.String, AgentTaskSchemas.AgentTaskJsonObject])),
    instructions: Schema.optional(Schema.String),
    maxAttempts: Schema.optional(PositiveInteger),
    metadata: Schema.optional(AgentTaskSchemas.AgentTaskJsonObject),
    model: Schema.optional(Schema.String),
    providerId: Schema.optional(Schema.String),
    requestedBy: Schema.optional(Schema.String),
    responseFormat: Schema.optional(AgentTaskSchemas.AgentTaskResponseFormat),
    tools: Schema.optional(Schema.Array(AgentTaskSchemas.AgentTaskToolRequest)),
    trigger: Schema.optional(Schema.String),
    workspace: Schema.optional(AgentTaskSchemas.AgentTaskWorkspace),
  }),
);
export const AgentTaskResourceEnvelope = ResourceEnvelopeOf(AgentTaskOutput);
export const AgentTaskAcceptedEnvelope = AcceptedResourceEnvelopeOf(AgentTaskOutput);
export const AgentTaskCollectionEnvelope = CollectionEnvelopeOf(AgentTaskOutput);
export const AgentTaskEventCollectionEnvelope = CollectionEnvelopeOf(AgentTaskEventOutput);
export const AgentTaskParams = { taskId: Schema.String };
export const AgentTaskIssueParams = {
  issueId: Schema.String,
  repositoryId: Schema.String,
};
export const AgentTaskListQueryParams = {
  "filter[originKind]": Schema.optional(Schema.String).annotate({
    description: "Agent task origin kind to match.",
  }),
  "filter[repositoryId]": Schema.optional(Schema.String).annotate({
    description: "Repository id associated with the task origin.",
  }),
  "filter[status]": Schema.optional(AgentTaskSchemas.AgentTaskStatus).annotate({
    description: "Agent task status to match.",
  }),
  "filter[ticketId]": Schema.optional(Schema.String).annotate({
    description: "Ticket id associated with the task origin.",
  }),
  "page[cursor]": Schema.optional(Schema.String).annotate({
    description: "Opaque cursor returned by the previous agent task collection response.",
  }),
  "page[limit]": Schema.optional(
    Schema.FiniteFromString.check(
      Schema.isInt(),
      Schema.isGreaterThanOrEqualTo(1),
      Schema.isLessThanOrEqualTo(100),
    ),
  ).annotate({
    description:
      "Maximum number of agent tasks to return. Defaults to 100 and must be between 1 and 100.",
  }),
};
export const AgentTaskEventQueryParams = {
  "page[cursor]": Schema.optional(Schema.String).annotate({
    description: "Event sequence cursor returned by the previous event collection response.",
  }),
  "page[limit]": Schema.optional(
    Schema.FiniteFromString.check(
      Schema.isInt(),
      Schema.isGreaterThanOrEqualTo(1),
      Schema.isLessThanOrEqualTo(100),
    ),
  ).annotate({
    description:
      "Maximum number of agent task events to return. Defaults to 100 and must be between 1 and 100.",
  }),
};
