import { Config } from "effect";
import {
  defaultAgentRuntimeConfig,
  type AgentRuntimeConfig,
} from "./AgentRuntimeContracts.ts";

export type AgentRuntimeEnvironmentConfig = Pick<
  AgentRuntimeConfig,
  | "automaticResume"
  | "defaultHarnessId"
  | "defaultMcpFailurePolicy"
  | "defaultProviderId"
  | "defaultTimeoutMs"
  | "eventDiagnostics"
  | "leaseDurationMs"
  | "ownerId"
  | "promptDiagnostics"
>;

const trimmedString = (name: string, fallback: string) =>
  Config.string(name).pipe(
    Config.withDefault(fallback),
    Config.map((value) => value.trim() || fallback),
  );

export const agentRuntimeEnvironmentConfig: Config.Config<AgentRuntimeEnvironmentConfig> =
  Config.all({
    automaticResume: Config.boolean("CYCLE_AGENT_AUTOMATIC_RESUME").pipe(
      Config.withDefault(defaultAgentRuntimeConfig.automaticResume),
    ),
    defaultHarnessId: trimmedString(
      "CYCLE_AGENT_DEFAULT_HARNESS_ID",
      defaultAgentRuntimeConfig.defaultHarnessId,
    ),
    defaultMcpFailurePolicy: Config.literals(
      ["fail-run", "warn-and-continue"],
      "CYCLE_AGENT_DEFAULT_MCP_FAILURE_POLICY",
    ).pipe(Config.withDefault(defaultAgentRuntimeConfig.defaultMcpFailurePolicy)),
    defaultProviderId: Config.literals(
      ["codex", "claude-code"],
      "CYCLE_AGENT_DEFAULT_PROVIDER_ID",
    ).pipe(Config.withDefault(defaultAgentRuntimeConfig.defaultProviderId)),
    defaultTimeoutMs: Config.int("CYCLE_AGENT_DEFAULT_TIMEOUT_MS").pipe(
      Config.withDefault(defaultAgentRuntimeConfig.defaultTimeoutMs),
    ),
    eventDiagnostics: Config.literals(
      ["raw-private", "redacted"],
      "CYCLE_AGENT_EVENT_DIAGNOSTICS",
    ).pipe(Config.withDefault(defaultAgentRuntimeConfig.eventDiagnostics)),
    leaseDurationMs: Config.int("CYCLE_AGENT_LEASE_DURATION_MS").pipe(
      Config.withDefault(defaultAgentRuntimeConfig.leaseDurationMs),
    ),
    ownerId: trimmedString("CYCLE_AGENT_RUNTIME_OWNER_ID", defaultAgentRuntimeConfig.ownerId),
    promptDiagnostics: Config.literals(
      ["redacted-full", "redacted-preview"],
      "CYCLE_AGENT_PROMPT_DIAGNOSTICS",
    ).pipe(Config.withDefault(defaultAgentRuntimeConfig.promptDiagnostics)),
  });

