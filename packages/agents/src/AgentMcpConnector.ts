import { Context, Effect, Layer } from "effect";
import type { AgentMcpAttachment } from "./types.ts";
import type { AgentRunRecord, AgentRuntimeMcpRequest } from "./AgentRuntimeContracts.ts";
import type { AgentAuthorityProfile } from "./AgentAuthorityPolicy.ts";
import type { AgentRuntimeError } from "./errors/index.ts";

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

