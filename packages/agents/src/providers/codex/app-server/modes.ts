import type { AgentRuntimeMode } from "../../../types.ts";
import type { ApprovalPolicy, SandboxMode } from "@cycle/codex-app-server";

export const defaultRuntimeMode: AgentRuntimeMode = "read-only";

export const runtimeModeFromUnknown = (value: unknown): AgentRuntimeMode =>
  value === "workspace-write" || value === "full-access" || value === "read-only"
    ? value
    : defaultRuntimeMode;

export const runtimeModeToCodexThreadConfig = (
  mode: AgentRuntimeMode,
): {
  readonly approvalPolicy: ApprovalPolicy;
  readonly sandbox: SandboxMode;
} => {
  switch (mode) {
    case "workspace-write":
      return {
        approvalPolicy: "on-request",
        sandbox: "workspace-write",
      };
    case "full-access":
      return {
        approvalPolicy: "never",
        sandbox: "danger-full-access",
      };
    case "read-only":
    default:
      return {
        approvalPolicy: "untrusted",
        sandbox: "read-only",
      };
  }
};
