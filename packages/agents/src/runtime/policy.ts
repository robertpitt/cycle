import { Context, Effect, Layer } from "effect";
import type { AgentMcpAttachment, AgentRuntimeMode } from "../types.ts";
import type {
  AgentRunRecord,
  AgentRuntimeAuthority,
  AgentRuntimeError,
  AgentRuntimeMcpRequest,
} from "./contracts.ts";
import { AgentRuntimeFailure } from "./contracts.ts";

export type AgentAuthorityProfile = {
  readonly codebaseReadOnly: boolean;
  readonly mcpAllowedOperations: readonly string[];
  readonly providerRuntimeMode: AgentRuntimeMode;
  readonly requiresWorktree: boolean;
  readonly workspacePath?: string;
  readonly workspaceWrite: boolean;
};

export type AgentAuthorityPolicyShape = {
  readonly resolve: (
    authority: AgentRuntimeAuthority,
  ) => Effect.Effect<AgentAuthorityProfile, AgentRuntimeError>;
};

export class AgentAuthorityPolicy extends Context.Service<
  AgentAuthorityPolicy,
  AgentAuthorityPolicyShape
>()("@cycle/agents/AgentAuthorityPolicy") {}

export const makeDefaultAgentAuthorityPolicy = (): AgentAuthorityPolicyShape => ({
  resolve: (authority) => {
    if (authority.mode === "ticket-context") {
      return Effect.succeed({
        codebaseReadOnly: true,
        mcpAllowedOperations: authority.allowedOperations ?? ["cycle:*"],
        providerRuntimeMode: "read-only",
        requiresWorktree: false,
        workspaceWrite: false,
      });
    }

    if (authority.mode === "implementation-worktree") {
      if (authority.workspacePath === undefined || authority.workspacePath.trim().length === 0) {
        return Effect.fail(
          new AgentRuntimeFailure({
            code: "workspace_unavailable",
            message: "implementation-worktree authority requires a workspacePath.",
            retryable: false,
          }),
        );
      }

      return Effect.succeed({
        codebaseReadOnly: false,
        mcpAllowedOperations: authority.allowedOperations ?? ["cycle:*"],
        providerRuntimeMode: "workspace-write",
        requiresWorktree: true,
        workspacePath: authority.workspacePath,
        workspaceWrite: true,
      });
    }

    return Effect.fail(
      new AgentRuntimeFailure({
        code: "authority_denied",
        message: `Authority mode '${authority.mode}' is not supported by the agent runtime.`,
        retryable: false,
      }),
    );
  },
});

export const AgentAuthorityPolicyLive = Layer.succeed(
  AgentAuthorityPolicy,
  AgentAuthorityPolicy.of(makeDefaultAgentAuthorityPolicy()),
);

export type AgentMcpScope = {
  readonly allowedOperations: readonly string[];
  readonly authorityMode: string;
  readonly commentId?: string;
  readonly expiresAt?: string;
  readonly jobId?: string;
  readonly repositoryId: string;
  readonly runId: string;
  readonly sessionId: string;
  readonly source: string;
  readonly ticketId?: string;
  readonly workspacePath?: string;
};

export type AgentMcpConnection = {
  readonly attachment: AgentMcpAttachment;
  readonly redactedAttachment: AgentMcpAttachment;
  readonly scope: AgentMcpScope;
};

export type AgentMcpConnectorShape = {
  readonly connect: (input: {
    readonly authorityProfile: AgentAuthorityProfile;
    readonly mcp: AgentRuntimeMcpRequest | undefined;
    readonly run: AgentRunRecord;
  }) => Effect.Effect<AgentMcpConnection | undefined, AgentRuntimeError>;
};

export class AgentMcpConnector extends Context.Service<AgentMcpConnector, AgentMcpConnectorShape>()(
  "@cycle/agents/AgentMcpConnector",
) {}

export const makeDefaultAgentMcpConnector = (): AgentMcpConnectorShape => ({
  connect: ({ authorityProfile, mcp, run }) => {
    if (mcp === undefined || mcp.mode === "disabled") return Effect.as(Effect.void, undefined);

    const allowedOperations =
      mcp.allowedOperations ??
      run.authority.allowedOperations ??
      authorityProfile.mcpAllowedOperations;
    const scope: AgentMcpScope = {
      allowedOperations,
      authorityMode: run.authority.mode,
      ...(run.authority.commentId === undefined ? {} : { commentId: run.authority.commentId }),
      ...(mcp.expiresAt === undefined ? {} : { expiresAt: mcp.expiresAt }),
      ...(run.authority.jobId === undefined ? {} : { jobId: run.authority.jobId }),
      repositoryId: run.authority.repositoryId,
      runId: run.runId,
      sessionId: run.sessionId,
      source: run.source,
      ...(run.authority.ticketId === undefined ? {} : { ticketId: run.authority.ticketId }),
      ...(run.authority.workspacePath === undefined
        ? {}
        : { workspacePath: run.authority.workspacePath }),
    };

    return Effect.succeed({
      attachment: mcp.attachment,
      redactedAttachment: redactAttachment(mcp.attachment),
      scope,
    });
  },
});

export const AgentMcpConnectorLive = Layer.succeed(
  AgentMcpConnector,
  AgentMcpConnector.of(makeDefaultAgentMcpConnector()),
);

const redactAttachment = (attachment: AgentMcpAttachment): AgentMcpAttachment => {
  if (attachment.mode === "stdio") {
    return {
      ...attachment,
      env:
        attachment.env === undefined
          ? undefined
          : Object.fromEntries(
              Object.entries(attachment.env).map(([key, value]) => [
                key,
                isSecretLike(key) ? "[redacted]" : value,
              ]),
            ),
    };
  }

  return {
    ...attachment,
    headers:
      attachment.headers === undefined
        ? undefined
        : Object.fromEntries(
            Object.entries(attachment.headers).map(([key, value]) => [
              key,
              isSecretLike(key) || key.toLowerCase() === "authorization" ? "[redacted]" : value,
            ]),
          ),
  };
};

const isSecretLike = (key: string): boolean =>
  /token|secret|password|authorization|credential|api[_-]?key/iu.test(key);
