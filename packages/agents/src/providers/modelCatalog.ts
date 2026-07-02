import type { AgentProviderId, AgentProviderProfile } from "../types.ts";
import { listCodexModelCatalog } from "./codex/app-server/modelCatalog.ts";

export type AgentProviderModelCatalog = {
  readonly defaultModel: string | null;
  readonly models: readonly string[];
};

export type AgentProviderModelCatalogInput = {
  readonly codexHome?: string;
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly executablePath?: string;
  readonly includeHidden?: boolean;
  readonly providerId: AgentProviderId;
  readonly timeoutMs?: number;
};

export type AgentProviderModelCatalogResolver = (
  input: AgentProviderModelCatalogInput,
) => Promise<AgentProviderModelCatalog>;

export const agentProviderModelCatalogResolvers = {
  codex: (input: AgentProviderModelCatalogInput) =>
    listCodexModelCatalog({
      codexHome: input.codexHome,
      cwd: input.cwd,
      env: input.env,
      executablePath: input.executablePath,
      includeHidden: input.includeHidden,
      timeoutMs: input.timeoutMs,
    }),
} satisfies Partial<Record<AgentProviderId, AgentProviderModelCatalogResolver>>;

export const listAgentProviderModels = async (
  input: AgentProviderModelCatalogInput,
  resolvers: Partial<Record<AgentProviderId, AgentProviderModelCatalogResolver>> =
    agentProviderModelCatalogResolvers,
): Promise<AgentProviderModelCatalog> => {
  const resolver = resolvers[input.providerId];
  if (resolver === undefined) {
    return {
      defaultModel: null,
      models: [],
    };
  }

  return resolver(input);
};

const uniqueModels = (models: readonly string[]): readonly string[] => {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const model of models) {
    const normalized = model.trim();
    if (normalized.length === 0 || seen.has(normalized)) continue;
    seen.add(normalized);
    values.push(normalized);
  }
  return values;
};

export const enrichAgentProviderProfileWithModels = async (
  profile: AgentProviderProfile,
  input: Omit<AgentProviderModelCatalogInput, "providerId"> = {},
): Promise<AgentProviderProfile> => {
  if (profile.status !== "available") return profile;

  try {
    const catalog = await listAgentProviderModels({
      ...input,
      executablePath: input.executablePath ?? profile.executablePath ?? profile.executableName,
      providerId: profile.provider,
    });
    const models = uniqueModels(catalog.models);
    if (models.length === 0) return profile;

    return {
      ...profile,
      defaultModel: profile.defaultModel ?? catalog.defaultModel ?? models[0] ?? null,
      models,
    };
  } catch {
    return profile;
  }
};
