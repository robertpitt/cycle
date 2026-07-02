import type {
  AgentCapabilities as ContractAgentCapabilities,
  AgentHarnessStatus as ContractAgentHarnessStatus,
  AgentProvider as ContractAgentProvider,
  AgentProviderId as ContractAgentProviderId,
  AgentProviderProfile as ContractAgentProviderProfile,
  AgentWorkJobType as ContractAgentWorkJobType,
  DetectedAgentProvider as ContractDetectedAgentProvider,
  JsonObject as ContractJsonObject,
  JsonValue as ContractJsonValue,
} from "@cycle/contracts/schemas";
import type { Schema } from "effect";

export type AgentProviderId = ContractAgentProviderId;

export type AgentProvider = ContractAgentProvider;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = ContractJsonValue;
export type JsonObject = ContractJsonObject;
export type JsonSchema = Record<string, unknown>;

export type AgentRuntimeMode = "read-only" | "workspace-write" | "full-access";

export type AgentAuthorityMode =
  | "ticket-context"
  | "disposable-worktree"
  | "implementation-worktree";

export type AgentJobTrigger = "assignment-pickup" | "agent-mention" | "manual";

export type AgentModelRef = {
  readonly provider?: string;
  readonly id: string;
};

export type AgentWorkJobType = ContractAgentWorkJobType;

export type AgentProviderFeatureCapabilities = {
  readonly streaming: boolean;
  readonly structuredOutput: boolean;
  readonly mcpAttachments: boolean;
  readonly commandExecution: boolean;
  readonly fileChanges: boolean;
  readonly workspaceWriteMode: boolean;
  readonly sessionResume: boolean;
  readonly abortInterrupt: boolean;
  readonly approvalInteractions: boolean;
  readonly userInputInteractions: boolean;
  readonly usageReporting: boolean;
  readonly modelSelection: boolean;
};

export type AgentAuthorityCapabilities = Readonly<Record<AgentAuthorityMode, boolean>>;

export type AgentProviderCapabilityMetadata = {
  readonly authorityModes?: AgentAuthorityCapabilities;
  readonly providerFeatures?: AgentProviderFeatureCapabilities;
};

export type AgentCapabilities = ContractAgentCapabilities & AgentProviderCapabilityMetadata;

export type AgentJobRequestMetadata = JsonObject & {
  readonly jobId: string;
  readonly repositoryId: string;
  readonly ticketId: string;
  readonly authorityMode: AgentAuthorityMode;
  readonly worktreePath?: string;
  readonly branchName?: string;
  readonly trigger: AgentJobTrigger;
  readonly triggerType: AgentJobTrigger;
  readonly triggerCommentId?: string;
  readonly agentId: string;
  readonly agent: {
    readonly id: string;
    readonly providerId?: AgentProviderId;
    readonly model?: string;
  };
};

export type CreateAgentJobRequestMetadataInput = {
  readonly jobId: string;
  readonly repositoryId: string;
  readonly ticketId: string;
  readonly authorityMode: AgentAuthorityMode;
  readonly worktreePath?: string;
  readonly branchName?: string;
  readonly trigger: AgentJobTrigger;
  readonly triggerCommentId?: string;
  readonly agentId: string;
  readonly providerId?: AgentProviderId;
  readonly model?: string;
};

export type AgentHarnessStatus = ContractAgentHarnessStatus;

export type AgentProviderProfile = ContractAgentProviderProfile;

export type AgentProviderDefinition = {
  readonly capabilities?: AgentCapabilities;
  readonly configurationSchema?: JsonSchema;
  readonly defaultEnabled?: boolean;
  readonly defaultMaxConcurrentRuns?: number | null;
  readonly documentationUrl?: string;
  readonly executable: string;
  readonly id: AgentProviderId;
  readonly name: string;
  readonly packageName?: string;
};

export type DetectedAgentProvider = ContractDetectedAgentProvider;

export type AgentHarness = {
  readonly capabilities: AgentCapabilities;
  readonly configurationSchema?: JsonSchema;
  readonly displayName: string;
  readonly executableName: string;
  readonly executablePath?: string;
  readonly harnessId: string;
  readonly lastCheckedAt?: string;
  readonly metadata?: JsonObject;
  readonly packageName: "@cycle/agents";
  readonly packageVersion: string;
  readonly providerId: AgentProviderId;
  readonly status: AgentHarnessStatus;
};

export type CreateAgentSessionInput = {
  readonly title?: string;
  readonly workspace?: {
    readonly cwd?: string;
    readonly requireGitRepo?: boolean;
  };
  readonly instructions?: string;
  readonly model?: AgentModelRef;
  readonly runtimeMode?: AgentRuntimeMode;
  readonly metadata?: JsonObject;
};

export type AgentSession = {
  readonly id: string;
  readonly provider: AgentProvider;
  readonly harnessId: string;
  readonly title?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly context?: JsonObject;
  readonly native?: {
    readonly id?: string;
    readonly threadId?: string;
    readonly sessionId?: string;
    readonly [key: string]: unknown;
  };
  readonly metadata?: JsonObject;
};

export type AgentSessionBindingStatus =
  | "idle"
  | "starting"
  | "running"
  | "waiting"
  | "stopped"
  | "error";

export type AgentSessionBinding = {
  readonly sessionId: string;
  readonly provider: AgentProviderId;
  readonly status: AgentSessionBindingStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly threadId?: string;
  readonly title?: string;
  readonly cwd?: string;
  readonly model?: string;
  readonly activeTurnId?: string;
  readonly native?: Readonly<Record<string, unknown>>;
  readonly runtime?: Readonly<Record<string, unknown>>;
  readonly lastError?: string;
  readonly metadata?: JsonObject;
};

export type AgentSessionStore = {
  readonly get: (sessionId: string) => Promise<AgentSessionBinding | undefined>;
  readonly upsert: (binding: AgentSessionBinding) => Promise<void>;
  readonly delete?: (sessionId: string) => Promise<void>;
  readonly list?: () => Promise<readonly AgentSessionBinding[]>;
  readonly close?: () => Promise<void> | void;
};

export type AgentTurnRuntimeStatus =
  | "starting"
  | "running"
  | "cancelling"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentTurnRuntimeRecord = {
  readonly turnId: string;
  readonly sessionId: string;
  readonly provider: AgentProviderId;
  readonly startedAt: string;
  readonly status: AgentTurnRuntimeStatus;
  readonly abortController: AbortController;
  readonly requestId?: string;
  readonly threadId?: string;
  readonly lastEventAt?: string;
  readonly lastError?: string;
};

export type AgentInput = string | { readonly parts: readonly AgentInputPart[] };
export type AgentInputPart = AgentTextPart;

export type AgentTextPart = {
  readonly type: "text";
  readonly text: string;
};

type AgentJsonSchemaResponseFormatBase = {
  readonly type: "json_schema";
  readonly name?: string;
  readonly schema: JsonSchema;
};

export type AgentResponseFormat<TStructured = unknown> =
  | {
      readonly type: "text";
    }
  | (AgentJsonSchemaResponseFormatBase & {
      readonly effectSchema: Schema.Codec<TStructured>;
      readonly parse?: (text: string) => unknown;
    })
  | (AgentJsonSchemaResponseFormatBase & {
      readonly effectSchema?: undefined;
      readonly parse: (text: string) => TStructured;
    });

export type AgentMcpAttachment =
  | {
      readonly mode: "http";
      readonly url: string;
      readonly headers?: Readonly<Record<string, string>>;
      readonly required?: boolean;
    }
  | {
      readonly mode: "stdio";
      readonly command: string;
      readonly args?: readonly string[];
      readonly env?: Readonly<Record<string, string>>;
      readonly required?: boolean;
    };

export type AgentTurnRequest<TStructured = unknown> = {
  readonly input: AgentInput;
  readonly model?: AgentModelRef;
  readonly instructions?: string;
  readonly runtimeMode?: AgentRuntimeMode;
  readonly responseFormat?: AgentResponseFormat<TStructured>;
  readonly mcp?: AgentMcpAttachment;
  readonly context?: JsonObject;
  readonly signal?: AbortSignal;
  readonly metadata?: JsonObject;
};

export type AgentTurnStatus = "completed" | "failed" | "cancelled";

export type AgentFinishReason =
  | "stop"
  | "length"
  | "tool_use"
  | "refusal"
  | "cancelled"
  | "error"
  | "unknown";

export type AgentTurnResult<TStructured = unknown> = {
  readonly id: string;
  readonly sessionId: string;
  readonly provider: AgentProvider;
  readonly status: AgentTurnStatus;
  readonly finishReason: AgentFinishReason;
  readonly text: string;
  readonly structured?: TStructured;
  readonly usage?: AgentUsage;
  readonly artifacts: readonly AgentArtifact[];
  readonly error?: AgentError;
  readonly raw?: unknown;
  readonly createdAt: Date;
  readonly completedAt?: Date;
  readonly metadata?: JsonObject;
};

export type AgentUsage = {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly reasoningTokens?: number;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
  readonly cost?: {
    readonly amount: number;
    readonly currency?: string;
  };
  readonly raw?: unknown;
};

export type AgentContentStreamKind =
  | "assistant_text"
  | "reasoning_text"
  | "reasoning_summary"
  | "plan"
  | "command_output"
  | "file_change_output"
  | "tool_output"
  | "unknown";

export type AgentPlanStep = {
  readonly status: "pending" | "inProgress" | "completed" | string;
  readonly step: string;
};

export type AgentApprovalKind = "command" | "file-change" | "permissions" | "unknown";

export type AgentApprovalDecision = "accept" | "acceptForSession" | "decline" | "cancel";

export type AgentApprovalRequest = {
  readonly createdAt: string;
  readonly defaultDecision?: AgentApprovalDecision;
  readonly details?: JsonObject;
  readonly itemId?: string;
  readonly kind: AgentApprovalKind;
  readonly requestId: string;
  readonly sessionId: string;
  readonly turnId?: string;
};

export type AgentUserInputQuestion = {
  readonly header: string;
  readonly id: string;
  readonly multiSelect: boolean;
  readonly options: readonly {
    readonly description?: string | null;
    readonly disabled?: boolean;
    readonly label: string;
    readonly value?: string;
  }[];
  readonly question: string;
  readonly type: "text" | "single_select" | "multi_select" | "boolean" | "unknown";
};

export type AgentUserInputRequest = {
  readonly createdAt: string;
  readonly itemId?: string;
  readonly prompt: string;
  readonly questions: readonly AgentUserInputQuestion[];
  readonly requestId: string;
  readonly sessionId: string;
  readonly turnId?: string;
};

export type AgentUserInputAnswer = {
  readonly questionId: string;
  readonly value: string | boolean | readonly string[];
};

export type AgentInteractionResponseResult = {
  readonly status: "accepted" | "rejected" | "already_resolved" | "not_found";
  readonly requestId: string;
  readonly sessionId: string;
};

export type AgentArtifact =
  | AgentTextArtifact
  | AgentFileArtifact
  | AgentPatchArtifact
  | AgentToolArtifact
  | AgentRawArtifact;

export type AgentTextArtifact = {
  readonly type: "text";
  readonly text: string;
  readonly name?: string;
  readonly mimeType?: "text/plain" | "text/markdown" | string;
};

export type AgentFileArtifact = {
  readonly type: "file";
  readonly path?: string;
  readonly name?: string;
  readonly mimeType?: string;
  readonly content?: string;
  readonly url?: string;
  readonly metadata?: JsonObject;
};

export type AgentPatchArtifact = {
  readonly type: "patch";
  readonly files?: readonly string[];
  readonly patch?: string;
  readonly summary?: string;
  readonly metadata?: JsonObject;
};

export type AgentToolArtifact = {
  readonly type: "tool";
  readonly name: string;
  readonly status: "started" | "completed" | "failed";
  readonly input?: unknown;
  readonly output?: unknown;
  readonly error?: AgentError;
  readonly metadata?: JsonObject;
};

export type AgentRawArtifact = {
  readonly type: "raw";
  readonly name?: string;
  readonly value: unknown;
};

export type AgentEvent<TStructured = unknown> =
  | {
      readonly type: "turn.started";
      readonly sessionId: string;
      readonly turnId: string;
      readonly provider: AgentProvider;
      readonly at: Date;
    }
  | {
      readonly type: "text.delta";
      readonly sessionId: string;
      readonly turnId: string;
      readonly delta: string;
      readonly snapshot?: string;
      readonly at: Date;
    }
  | {
      readonly type: "content.delta";
      readonly sessionId: string;
      readonly turnId: string;
      readonly delta: string;
      readonly streamKind: AgentContentStreamKind;
      readonly itemId?: string;
      readonly snapshot?: string;
      readonly at: Date;
    }
  | {
      readonly type: "turn.plan.updated";
      readonly sessionId: string;
      readonly turnId: string;
      readonly explanation?: string;
      readonly plan: readonly AgentPlanStep[];
      readonly at: Date;
    }
  | {
      readonly type: "turn.diff.updated";
      readonly sessionId: string;
      readonly turnId: string;
      readonly diff: string;
      readonly at: Date;
    }
  | {
      readonly type: "item.started" | "item.updated" | "item.completed";
      readonly sessionId: string;
      readonly turnId: string;
      readonly itemId: string;
      readonly itemType?: string;
      readonly item?: unknown;
      readonly at: Date;
    }
  | {
      readonly type: "approval.requested";
      readonly sessionId: string;
      readonly turnId: string;
      readonly request: AgentApprovalRequest;
      readonly at: Date;
    }
  | {
      readonly type: "approval.resolved";
      readonly sessionId: string;
      readonly turnId?: string;
      readonly requestId: string;
      readonly decision: AgentApprovalDecision;
      readonly at: Date;
    }
  | {
      readonly type: "user-input.requested";
      readonly sessionId: string;
      readonly turnId: string;
      readonly request: AgentUserInputRequest;
      readonly at: Date;
    }
  | {
      readonly type: "user-input.resolved";
      readonly sessionId: string;
      readonly turnId?: string;
      readonly requestId: string;
      readonly answers: readonly AgentUserInputAnswer[];
      readonly at: Date;
    }
  | {
      readonly type: "runtime.warning";
      readonly sessionId: string;
      readonly turnId?: string;
      readonly message: string;
      readonly at: Date;
      readonly raw?: unknown;
    }
  | {
      readonly type: "runtime.error";
      readonly sessionId: string;
      readonly turnId?: string;
      readonly error: AgentError;
      readonly at: Date;
    }
  | {
      readonly type: "progress";
      readonly sessionId: string;
      readonly turnId: string;
      readonly message: string;
      readonly at: Date;
      readonly raw?: unknown;
    }
  | {
      readonly type: "artifact";
      readonly sessionId: string;
      readonly turnId: string;
      readonly artifact: AgentArtifact;
      readonly at: Date;
    }
  | {
      readonly type: "usage";
      readonly sessionId: string;
      readonly turnId: string;
      readonly usage: AgentUsage;
      readonly at: Date;
    }
  | {
      readonly type: "turn.completed";
      readonly sessionId: string;
      readonly turnId: string;
      readonly result: AgentTurnResult<TStructured>;
      readonly at: Date;
    }
  | {
      readonly type: "turn.failed";
      readonly sessionId: string;
      readonly turnId: string;
      readonly error: AgentError;
      readonly at: Date;
    }
  | {
      readonly type: "turn.cancelled";
      readonly sessionId: string;
      readonly turnId: string;
      readonly error: AgentError;
      readonly at: Date;
    };

export type AgentError = {
  readonly code:
    | "provider_error"
    | "authentication_error"
    | "rate_limit"
    | "invalid_request"
    | "unsupported_option"
    | "cancelled"
    | "timeout"
    | "parse_error"
    | "mcp_unavailable"
    | "workspace_unavailable"
    | "unknown";
  readonly message: string;
  readonly provider: AgentProvider;
  readonly retryable?: boolean;
  readonly statusCode?: number;
  readonly raw?: unknown;
};

export type AbortTurnResult = {
  readonly accepted: boolean;
  readonly reason?: "not_supported" | "not_found" | "already_finished" | "cancel_requested";
};

export type AgentService = {
  readonly provider: AgentProvider;
  capabilities(): AgentCapabilities;
  createSession(input?: CreateAgentSessionInput): Promise<AgentSession>;
  resumeSession(sessionId: string): Promise<AgentSession>;
  run<TStructured = unknown>(
    sessionId: string,
    request: AgentTurnRequest<TStructured>,
  ): Promise<AgentTurnResult<TStructured>>;
  stream<TStructured = unknown>(
    sessionId: string,
    request: AgentTurnRequest<TStructured>,
  ): AsyncIterable<AgentEvent<TStructured>>;
  respondToApproval(
    sessionId: string,
    requestId: string,
    decision: AgentApprovalDecision,
  ): Promise<AgentInteractionResponseResult>;
  respondToUserInput(
    sessionId: string,
    requestId: string,
    answers: readonly AgentUserInputAnswer[],
  ): Promise<AgentInteractionResponseResult>;
  abortTurn(sessionId: string, turnId?: string): Promise<AbortTurnResult>;
  close(): Promise<void>;
};
