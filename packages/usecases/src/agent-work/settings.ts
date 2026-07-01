import type { AgentProviderId } from "@cycle/agents/types";
import type { AgentWorkAuthorityMode } from "./types.ts";

export type AgentWorkPerAgentOverride = {
  readonly enabled?: boolean;
  readonly maxConcurrentJobs?: number | null;
  readonly providerId?: AgentProviderId;
  readonly model?: string;
  readonly defaultAuthorityMode?: AgentWorkAuthorityMode;
};

export type GlobalAgentWorkSettings = {
  readonly paused: boolean;
  readonly maxConcurrentJobs: number | null;
  readonly defaultProviderId: AgentProviderId;
  readonly defaultModel?: string;
  readonly enabledProviders: readonly AgentProviderId[];
  readonly defaultMentionAuthorityMode: AgentWorkAuthorityMode;
  readonly allowDisposableWorktreeForMentions: boolean;
  readonly allowFullAccessJobs: boolean;
  readonly perAgentOverrides: Readonly<Record<string, AgentWorkPerAgentOverride>>;
};

export type RepositoryAgentWorkSettings = {
  readonly repositoryId: string;
  readonly paused: boolean;
  readonly maxConcurrentJobs: number | null;
  readonly agentWorkDisabled: boolean;
  readonly providerId?: AgentProviderId;
  readonly model?: string;
  readonly perAgentOverrides: Readonly<Record<string, AgentWorkPerAgentOverride>>;
  readonly updatedAt: string;
};

export type AgentWorkSettingsValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly string[] };

export const defaultGlobalAgentWorkSettings = (): GlobalAgentWorkSettings => ({
  allowDisposableWorktreeForMentions: true,
  allowFullAccessJobs: false,
  defaultMentionAuthorityMode: "ticket-context",
  defaultProviderId: "codex",
  enabledProviders: ["codex"],
  maxConcurrentJobs: 1,
  paused: false,
  perAgentOverrides: {},
});

export const defaultRepositoryAgentWorkSettings = (
  repositoryId: string,
  updatedAt: string = new Date().toISOString(),
): RepositoryAgentWorkSettings => ({
  agentWorkDisabled: false,
  maxConcurrentJobs: 1,
  paused: false,
  perAgentOverrides: {},
  repositoryId,
  updatedAt,
});

export const mergeGlobalAgentWorkSettings = (
  input: Partial<GlobalAgentWorkSettings> | undefined,
): AgentWorkSettingsValidationResult<GlobalAgentWorkSettings> => {
  const merged: GlobalAgentWorkSettings = {
    ...defaultGlobalAgentWorkSettings(),
    ...input,
    perAgentOverrides: input?.perAgentOverrides ?? {},
  };

  return validateGlobalAgentWorkSettings(merged);
};

export const mergeRepositoryAgentWorkSettings = (
  repositoryId: string,
  input: Partial<Omit<RepositoryAgentWorkSettings, "repositoryId">> | undefined,
  updatedAt: string = new Date().toISOString(),
): AgentWorkSettingsValidationResult<RepositoryAgentWorkSettings> => {
  const merged: RepositoryAgentWorkSettings = {
    ...defaultRepositoryAgentWorkSettings(repositoryId, updatedAt),
    ...input,
    repositoryId,
    perAgentOverrides: input?.perAgentOverrides ?? {},
    updatedAt: input?.updatedAt ?? updatedAt,
  };

  return validateRepositoryAgentWorkSettings(merged);
};

export const validateGlobalAgentWorkSettings = (
  settings: GlobalAgentWorkSettings,
): AgentWorkSettingsValidationResult<GlobalAgentWorkSettings> => {
  const errors = validateSharedSettings(settings);

  if (!settings.enabledProviders.includes(settings.defaultProviderId)) {
    errors.push("defaultProviderId must be enabled");
  }
  if (!isAuthorityMode(settings.defaultMentionAuthorityMode)) {
    errors.push("defaultMentionAuthorityMode is invalid");
  }

  return errors.length === 0 ? { ok: true, value: settings } : { errors, ok: false };
};

export const validateRepositoryAgentWorkSettings = (
  settings: RepositoryAgentWorkSettings,
): AgentWorkSettingsValidationResult<RepositoryAgentWorkSettings> => {
  const errors = validateSharedSettings(settings);

  if (settings.repositoryId.trim() === "") {
    errors.push("repositoryId is required");
  }

  return errors.length === 0 ? { ok: true, value: settings } : { errors, ok: false };
};

const validateSharedSettings = (settings: {
  readonly maxConcurrentJobs: number | null;
  readonly perAgentOverrides: Readonly<Record<string, AgentWorkPerAgentOverride>>;
}): string[] => {
  const errors: string[] = [];

  if (
    settings.maxConcurrentJobs !== null &&
    (!Number.isInteger(settings.maxConcurrentJobs) || settings.maxConcurrentJobs < 1)
  ) {
    errors.push("maxConcurrentJobs must be a positive integer or null");
  }

  for (const [agentId, override] of Object.entries(settings.perAgentOverrides)) {
    if (agentId.trim() === "") {
      errors.push("perAgentOverrides keys must be non-empty agent IDs");
    }
    if (
      override.maxConcurrentJobs !== undefined &&
      override.maxConcurrentJobs !== null &&
      (!Number.isInteger(override.maxConcurrentJobs) || override.maxConcurrentJobs < 1)
    ) {
      errors.push(
        `perAgentOverrides.${agentId}.maxConcurrentJobs must be a positive integer or null`,
      );
    }
    if (
      override.defaultAuthorityMode !== undefined &&
      !isAuthorityMode(override.defaultAuthorityMode)
    ) {
      errors.push(`perAgentOverrides.${agentId}.defaultAuthorityMode is invalid`);
    }
  }

  return errors;
};

const isAuthorityMode = (value: string): value is AgentWorkAuthorityMode =>
  value === "ticket-context" ||
  value === "disposable-worktree" ||
  value === "implementation-worktree";
