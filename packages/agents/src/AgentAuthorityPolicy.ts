import { Context, Effect, Layer } from "effect";
import type { AgentRuntimeMode } from "./types.ts";
import type { AgentRuntimeAuthority } from "./AgentRuntimeContracts.ts";
import { AgentRuntimeFailure, type AgentRuntimeError } from "./errors/index.ts";

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

