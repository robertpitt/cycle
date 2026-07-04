import { Context, Effect, Layer, Stream } from "effect";
import type {
  AgentApprovalDecision,
  AgentEvent,
  AgentProviderId,
  AgentUserInputAnswer,
} from "../types.ts";
import type {
  AgentAttemptRecord,
  AgentPromptBundle,
  AgentProviderBindingRecord,
  AgentRunRecord,
  AgentSessionRecord,
} from "./contracts.ts";
import { AgentRuntimeFailure, type AgentRuntimeError } from "../errors/index.ts";
import type { AgentAuthorityProfile, AgentMcpConnection } from "./policy.ts";

export type AgentHarnessCapabilities = {
  readonly approvalRequests: boolean;
  readonly interrupt: boolean;
  readonly mcpHttp: boolean;
  readonly mcpStdio: boolean;
  readonly nativeThreadResume: boolean;
  readonly providerNativeCodeTools: boolean;
  readonly readOnlyWorkspace: boolean;
  readonly sessionResume: boolean;
  readonly steering: boolean;
  readonly streaming: boolean;
  readonly structuredOutput: boolean;
  readonly usageReporting: boolean;
  readonly userInputRequests: boolean;
  readonly workspaceWrite: boolean;
};

export type HarnessOpenSessionRequest = {
  readonly attempt: AgentAttemptRecord;
  readonly run: AgentRunRecord;
  readonly session: AgentSessionRecord;
};

export type HarnessExecuteRequest = {
  readonly attempt: AgentAttemptRecord;
  readonly authorityProfile: AgentAuthorityProfile;
  readonly mcp?: AgentMcpConnection;
  readonly prompt: AgentPromptBundle;
  readonly run: AgentRunRecord;
  readonly session: AgentSessionRecord;
  readonly signal?: AbortSignal;
};

export type HarnessCancelRequest = {
  readonly attempt: AgentAttemptRecord;
  readonly reason?: string;
  readonly run: AgentRunRecord;
  readonly session: AgentSessionRecord;
};

export type HarnessSteerRequest = {
  readonly attempt?: AgentAttemptRecord;
  readonly message: string;
  readonly run: AgentRunRecord;
  readonly session: AgentSessionRecord;
};

export type HarnessInteractionResponse =
  | {
      readonly decision: AgentApprovalDecision;
      readonly requestId: string;
      readonly sessionId: string;
      readonly type: "approval";
    }
  | {
      readonly answers: readonly AgentUserInputAnswer[];
      readonly requestId: string;
      readonly sessionId: string;
      readonly type: "user-input";
    };

export type HarnessInteractionResult = {
  readonly status: "accepted" | "already_resolved" | "not_found" | "rejected";
};

export type HarnessCancelResult = {
  readonly accepted: boolean;
  readonly reason?: string;
};

export type HarnessSteerResult = {
  readonly accepted: boolean;
  readonly reason?: string;
};

export type AgentHarnessAdapter = {
  readonly capabilities: Effect.Effect<AgentHarnessCapabilities, AgentRuntimeError>;
  readonly cancel: (
    request: HarnessCancelRequest,
  ) => Effect.Effect<HarnessCancelResult, AgentRuntimeError>;
  readonly execute: (
    request: HarnessExecuteRequest,
  ) => Stream.Stream<AgentEvent, AgentRuntimeError>;
  readonly harnessId: string;
  readonly openSession: (
    request: HarnessOpenSessionRequest,
  ) => Effect.Effect<AgentProviderBindingRecord, AgentRuntimeError>;
  readonly providerId: AgentProviderId;
  readonly resolveInteraction: (
    request: HarnessInteractionResponse,
  ) => Effect.Effect<HarnessInteractionResult, AgentRuntimeError>;
  readonly steer: (
    request: HarnessSteerRequest,
  ) => Effect.Effect<HarnessSteerResult, AgentRuntimeError>;
};

export type AgentHarnessRegistryShape = {
  readonly get: (harnessId: string) => Effect.Effect<AgentHarnessAdapter, AgentRuntimeError>;
  readonly list: () => Effect.Effect<readonly AgentHarnessAdapter[], AgentRuntimeError>;
};

export class AgentHarnessRegistry extends Context.Service<
  AgentHarnessRegistry,
  AgentHarnessRegistryShape
>()("@cycle/agents/AgentHarnessRegistry") {}

export const makeAgentHarnessRegistry = (
  harnesses: readonly AgentHarnessAdapter[],
): AgentHarnessRegistryShape => {
  const byId = new Map(harnesses.map((harness) => [harness.harnessId, harness]));

  return {
    get: (harnessId) => {
      const harness = byId.get(harnessId);
      return harness === undefined
        ? Effect.fail(
            new AgentRuntimeFailure({
              code: "harness_unavailable",
              message: `Agent harness '${harnessId}' is not registered.`,
              retryable: false,
            }),
          )
        : Effect.succeed(harness);
    },
    list: () => Effect.succeed([...harnesses]),
  };
};

export const AgentHarnessRegistryLive = (harnesses: readonly AgentHarnessAdapter[]) =>
  Layer.succeed(AgentHarnessRegistry, AgentHarnessRegistry.of(makeAgentHarnessRegistry(harnesses)));

export const harnessError = (cause: unknown): AgentRuntimeError => {
  if (cause instanceof Error && /auth|login|credential/iu.test(cause.message)) {
    return new AgentRuntimeFailure({
      cause,
      code: "authentication_error",
      message: cause.message,
      retryable: false,
    });
  }
  if (cause instanceof Error && /timeout/iu.test(cause.message)) {
    return new AgentRuntimeFailure({
      cause,
      code: "timeout",
      message: cause.message,
      retryable: true,
    });
  }
  if (cause instanceof Error && /cancel|abort|interrupt/iu.test(cause.message)) {
    return new AgentRuntimeFailure({
      cause,
      code: "cancelled",
      message: cause.message,
      retryable: false,
    });
  }
  return new AgentRuntimeFailure({
    cause,
    code: "provider_error",
    message: cause instanceof Error ? cause.message : "Agent harness failed.",
    retryable: false,
  });
};
