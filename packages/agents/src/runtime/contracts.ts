import { Schema, Stream } from "effect";
import type { AgentAuthorityMode, AgentMcpAttachment, AgentProviderId } from "../types.ts";
import type { AgentRuntimeError } from "../errors/index.ts";
import type { AgentRuntimeEvent } from "./events.ts";

export { AgentRuntimeFailure, type AgentRuntimeError } from "../errors/index.ts";

export type JsonObject = Readonly<Record<string, unknown>>;

export type AgentRunSource =
  | "agent-work"
  | "chat"
  | "comment-tag"
  | "manual"
  | "schedule"
  | (string & {});

export type AgentRunStatus =
  | "created"
  | "preparing"
  | "running"
  | "waiting-for-approval"
  | "waiting-for-input"
  | "cancelling"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export type AgentAttemptStatus =
  | "starting"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export type AgentSessionStatus = "closed" | "error" | "idle" | "running" | "waiting";

export type AgentInteractionStatus = "cancelled" | "expired" | "open" | "rejected" | "resolved";
export type AgentInteractionType = "approval" | "steering" | "user-input" | (string & {});

export type AgentRuntimeErrorCode =
  | "authentication_error"
  | "authority_denied"
  | "cancelled"
  | "harness_unavailable"
  | "harness_unsupported"
  | "interrupted"
  | "invalid_request"
  | "mcp_unauthorized"
  | "mcp_unavailable"
  | "parse_error"
  | "provider_error"
  | "rate_limit"
  | "storage_error"
  | "timeout"
  | "unknown"
  | "workspace_unavailable";

export type AgentRuntimeConfig = {
  readonly automaticResume: boolean;
  readonly defaultHarnessId: string;
  readonly defaultMcpFailurePolicy: "fail-run" | "warn-and-continue";
  readonly defaultModel?: string;
  readonly defaultProviderId: AgentProviderId;
  readonly defaultTimeoutMs: number;
  readonly eventDiagnostics: "raw-private" | "redacted";
  readonly leaseDurationMs: number;
  readonly ownerId: string;
  readonly promptDiagnostics: "redacted-full" | "redacted-preview";
};

export const defaultAgentRuntimeConfig: AgentRuntimeConfig = {
  automaticResume: false,
  defaultHarnessId: "codex",
  defaultMcpFailurePolicy: "warn-and-continue",
  defaultProviderId: "codex",
  defaultTimeoutMs: 600_000,
  eventDiagnostics: "redacted",
  leaseDurationMs: 60_000,
  ownerId: "cycle-agent-runtime",
  promptDiagnostics: "redacted-preview",
};

const JsonObjectSchema = Schema.Record(Schema.String, Schema.Unknown);

export const AgentRuntimeConfigSchema = Schema.Struct({
  automaticResume: Schema.Boolean,
  defaultHarnessId: Schema.String,
  defaultMcpFailurePolicy: Schema.Literals(["fail-run", "warn-and-continue"]),
  defaultModel: Schema.optional(Schema.String),
  defaultProviderId: Schema.String,
  defaultTimeoutMs: Schema.Number,
  eventDiagnostics: Schema.Literals(["raw-private", "redacted"]),
  leaseDurationMs: Schema.Number,
  ownerId: Schema.String,
  promptDiagnostics: Schema.Literals(["redacted-full", "redacted-preview"]),
});

export type AgentRuntimeAuthority = {
  readonly allowedOperations?: readonly string[];
  readonly branchName?: string;
  readonly commentId?: string;
  readonly jobId?: string;
  readonly mode: AgentAuthorityMode;
  readonly repositoryId: string;
  readonly scheduleId?: string;
  readonly ticketId?: string;
  readonly workspacePath?: string;
  readonly worktreeId?: string;
};

export const AgentRuntimeAuthoritySchema = Schema.Struct({
  allowedOperations: Schema.optional(Schema.Array(Schema.String)),
  branchName: Schema.optional(Schema.String),
  commentId: Schema.optional(Schema.String),
  jobId: Schema.optional(Schema.String),
  mode: Schema.Literals(["implementation-worktree", "ticket-context", "disposable-worktree"]),
  repositoryId: Schema.String,
  scheduleId: Schema.optional(Schema.String),
  ticketId: Schema.optional(Schema.String),
  workspacePath: Schema.optional(Schema.String),
  worktreeId: Schema.optional(Schema.String),
});

export type AgentSessionSelection =
  | {
      readonly conversationKey?: string;
      readonly title?: string;
      readonly type: "create";
    }
  | {
      readonly conversationKey: string;
      readonly title?: string;
      readonly type: "by-conversation-key";
    }
  | {
      readonly sessionId: string;
      readonly type: "reuse";
    };

export const AgentSessionSelectionSchema = Schema.Union([
  Schema.Struct({
    conversationKey: Schema.optional(Schema.String),
    title: Schema.optional(Schema.String),
    type: Schema.Literal("create"),
  }),
  Schema.Struct({
    conversationKey: Schema.String,
    title: Schema.optional(Schema.String),
    type: Schema.Literal("by-conversation-key"),
  }),
  Schema.Struct({
    sessionId: Schema.String,
    type: Schema.Literal("reuse"),
  }),
]);

export type AgentRuntimeMcpRequest =
  | {
      readonly mode: "disabled";
    }
  | {
      readonly attachment: AgentMcpAttachment;
      readonly allowedOperations?: readonly string[];
      readonly expiresAt?: string;
      readonly mode: "attach";
    };

export const AgentRuntimeMcpRequestSchema = Schema.Union([
  Schema.Struct({
    mode: Schema.Literal("disabled"),
  }),
  Schema.Struct({
    allowedOperations: Schema.optional(Schema.Array(Schema.String)),
    attachment: Schema.Union([
      Schema.Struct({
        headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
        mode: Schema.Literal("http"),
        url: Schema.String,
      }),
      Schema.Struct({
        args: Schema.optional(Schema.Array(Schema.String)),
        command: Schema.String,
        env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
        mode: Schema.Literal("stdio"),
      }),
    ]),
    expiresAt: Schema.optional(Schema.String),
    mode: Schema.Literal("attach"),
  }),
]);

export type AgentPromptRequest = {
  readonly input: JsonObject;
  readonly templateId: string;
};

export const AgentPromptRequestSchema = Schema.Struct({
  input: JsonObjectSchema,
  templateId: Schema.String,
});

export type AgentRunStartRequest = {
  readonly agent: {
    readonly agentId: string;
    readonly displayName?: string;
  };
  readonly authority: AgentRuntimeAuthority;
  readonly harness?: {
    readonly harnessId?: string;
    readonly model?: string;
    readonly providerId?: AgentProviderId;
  };
  readonly idempotencyKey?: string;
  readonly mcp?: AgentRuntimeMcpRequest;
  readonly metadata?: JsonObject;
  readonly prompt: AgentPromptRequest;
  readonly session?: AgentSessionSelection;
  readonly signal?: AbortSignal;
  readonly source: AgentRunSource;
};

export const AgentRunStartRequestSchema = Schema.Struct({
  agent: Schema.Struct({
    agentId: Schema.String,
    displayName: Schema.optional(Schema.String),
  }),
  authority: AgentRuntimeAuthoritySchema,
  harness: Schema.optional(
    Schema.Struct({
      harnessId: Schema.optional(Schema.String),
      model: Schema.optional(Schema.String),
      providerId: Schema.optional(Schema.String),
    }),
  ),
  idempotencyKey: Schema.optional(Schema.String),
  mcp: Schema.optional(AgentRuntimeMcpRequestSchema),
  metadata: Schema.optional(JsonObjectSchema),
  prompt: AgentPromptRequestSchema,
  session: Schema.optional(AgentSessionSelectionSchema),
  signal: Schema.optional(Schema.Unknown),
  source: Schema.String,
});

export type AgentRunResumeRequest = {
  readonly message?: string;
  readonly reason?: string;
  readonly runId: string;
  readonly signal?: AbortSignal;
};

export type AgentRunCancelRequest = {
  readonly reason?: string;
  readonly runId: string;
};

export type AgentRunSteerRequest = {
  readonly message: string;
  readonly runId: string;
};

export type AgentRunEventsRequest = {
  readonly afterSequence?: number;
  readonly runId: string;
  readonly tail?: boolean;
};

export type AgentRuntimeReconcileRequest = {
  readonly ownerId?: string;
  readonly resumeInterrupted?: boolean;
};

export type AgentSessionRecord = {
  readonly conversationKey?: string;
  readonly createdAt: string;
  readonly harnessId: string;
  readonly metadata: JsonObject;
  readonly model?: string;
  readonly native: JsonObject;
  readonly providerId: AgentProviderId;
  readonly repositoryId?: string;
  readonly sessionId: string;
  readonly status: AgentSessionStatus;
  readonly ticketId?: string;
  readonly title?: string;
  readonly updatedAt: string;
};

export type AgentRunTerminalState =
  | {
      readonly status: "cancelled";
      readonly reason: string;
    }
  | {
      readonly status: "completed";
      readonly summary: string;
    }
  | {
      readonly code: string;
      readonly message: string;
      readonly retryable?: boolean;
      readonly status: "failed";
    }
  | {
      readonly reason: string;
      readonly status: "interrupted";
    };

export type AgentPromptBundle = {
  readonly context: JsonObject;
  readonly createdAt: string;
  readonly promptId: string;
  readonly redactedSystemPreview: string;
  readonly redactedUserPreview: string;
  readonly system: string;
  readonly systemHash: string;
  readonly templateId: string;
  readonly templateVersion: string;
  readonly user: string;
  readonly userHash: string;
};

export type AgentRunRecord = {
  readonly agentId: string;
  readonly attemptId?: string;
  readonly authority: AgentRuntimeAuthority;
  readonly completedAt?: string;
  readonly createdAt: string;
  readonly harnessId: string;
  readonly idempotencyKey: string;
  readonly metadata: JsonObject;
  readonly model?: string;
  readonly prompt: AgentPromptBundle;
  readonly providerId: AgentProviderId;
  readonly runId: string;
  readonly sessionId: string;
  readonly source: AgentRunSource;
  readonly startedAt?: string;
  readonly status: AgentRunStatus;
  readonly terminal?: AgentRunTerminalState;
  readonly updatedAt: string;
};

export type AgentAttemptRecord = {
  readonly attemptId: string;
  readonly completedAt?: string;
  readonly heartbeatAt?: string;
  readonly lastError?: string;
  readonly leaseExpiresAt?: string;
  readonly native: JsonObject;
  readonly ownerId: string;
  readonly providerTurnId?: string;
  readonly runId: string;
  readonly sessionId: string;
  readonly startedAt: string;
  readonly status: AgentAttemptStatus;
};

export type AgentProviderBindingRecord = {
  readonly attemptId?: string;
  readonly bindingId: string;
  readonly createdAt: string;
  readonly harnessId: string;
  readonly lastError?: string;
  readonly native: JsonObject;
  readonly providerId: AgentProviderId;
  readonly runId?: string;
  readonly sessionId: string;
  readonly status: "active" | "closed" | "error" | "idle";
  readonly updatedAt: string;
};

export type AgentInteractionRecord = {
  readonly attemptId?: string;
  readonly createdAt: string;
  readonly defaultDecision?: string;
  readonly interactionId: string;
  readonly payload: JsonObject;
  readonly prompt: string;
  readonly resolvedAt?: string;
  readonly runId: string;
  readonly schema?: JsonObject;
  readonly status: AgentInteractionStatus;
  readonly type: AgentInteractionType;
};

export type AgentRunSnapshot = {
  readonly activeAttempt?: AgentAttemptRecord;
  readonly events: readonly AgentRuntimeEvent[];
  readonly run: AgentRunRecord;
  readonly session: AgentSessionRecord;
};

export type AgentRunHandle = {
  readonly attemptId: string;
  readonly events: Stream.Stream<AgentRuntimeEvent, AgentRuntimeError>;
  readonly runId: string;
  readonly sessionId: string;
  readonly snapshot: AgentRunSnapshot;
};
