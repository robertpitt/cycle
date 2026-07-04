import { Schema } from "effect";
import { JsonObject } from "../components/JsonObject.ts";
import { NonNegativeInteger } from "../components/NonNegativeInteger.ts";
import { PositiveInteger } from "../components/PositiveInteger.ts";
import { AgentWorkAuthorityMode } from "./AgentWorkAuthorityMode.ts";
import { AgentWorkJobStatus } from "./AgentWorkJobStatus.ts";
import { AgentWorkTrigger } from "./AgentWorkTrigger.ts";

export const AgentWorkJob = Schema.Struct({
  agentId: Schema.String.pipe(Schema.annotateKey({ description: "Agent id assigned to the job." })),
  attempt: NonNegativeInteger.pipe(
    Schema.annotateKey({ description: "Zero-based attempt count for this logical job." }),
  ),
  authorityMode: AgentWorkAuthorityMode.pipe(
    Schema.annotateKey({ description: "Workspace and authority mode granted to the job." }),
  ),
  branchAssociationId: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({
      description: "Associated branch record id, or null when not associated.",
    }),
  ),
  completedAt: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({ description: "ISO timestamp when the job reached a terminal status." }),
  ),
  createdAt: Schema.String.pipe(
    Schema.annotateKey({ description: "ISO timestamp when the job was created." }),
  ),
  currentGate: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({
      description: "Current approval or waiting gate, or null when none is active.",
    }),
  ),
  dedupeKey: Schema.String.pipe(
    Schema.annotateKey({ description: "Deduplication key used to avoid duplicate jobs." }),
  ),
  executionId: Schema.String.pipe(
    Schema.annotateKey({ description: "Runtime execution id for the active attempt." }),
  ),
  jobId: Schema.String.pipe(Schema.annotateKey({ description: "Stable public job id." })),
  lastError: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({
      description: "Last failure message, or null when no failure has been recorded.",
    }),
  ),
  lastHeartbeatAt: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({ description: "ISO timestamp for the last runner heartbeat." }),
  ),
  lastProviderEventAt: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({ description: "ISO timestamp for the last provider event." }),
  ),
  logicalJobKey: Schema.String.pipe(
    Schema.annotateKey({ description: "Stable key shared by retries of the same logical job." }),
  ),
  maxAttempts: PositiveInteger.pipe(
    Schema.annotateKey({ description: "Maximum attempts allowed for the job." }),
  ),
  metadata: JsonObject.pipe(
    Schema.annotateKey({ description: "Job metadata preserved as public JSON extension data." }),
  ),
  model: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({
      description: "Model id used by the job, or null when provider default applies.",
    }),
  ),
  providerId: Schema.String.pipe(
    Schema.annotateKey({ description: "Provider id selected for the job." }),
  ),
  providerSessionId: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({ description: "Provider session id, or null before one is established." }),
  ),
  repositoryId: Schema.String.pipe(
    Schema.annotateKey({ description: "Repository id containing the ticket." }),
  ),
  requestedBy: Schema.String.pipe(
    Schema.annotateKey({ description: "User or system id that requested the job." }),
  ),
  schemaVersion: Schema.Literal(1).pipe(
    Schema.annotateKey({ description: "Schema version for the job record." }),
  ),
  startedAt: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({
      description: "ISO timestamp when execution started, or null if not started.",
    }),
  ),
  status: AgentWorkJobStatus.pipe(Schema.annotateKey({ description: "Current lifecycle status." })),
  ticketId: Schema.String.pipe(
    Schema.annotateKey({ description: "Ticket id the job operates on." }),
  ),
  trigger: AgentWorkTrigger.pipe(
    Schema.annotateKey({ description: "Reason the job was created." }),
  ),
  updatedAt: Schema.String.pipe(
    Schema.annotateKey({ description: "ISO timestamp when the job was last changed." }),
  ),
  workflowId: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({ description: "Optional workflow id coordinating the job." }),
  ),
  worktreeId: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({ description: "Optional worktree id assigned to the job." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Public Agent Work job record.",
    identifier: "@cycle/contracts/AgentWorkJob",
    title: "AgentWorkJob",
  }),
);
export type AgentWorkJob = typeof AgentWorkJob.Type;
