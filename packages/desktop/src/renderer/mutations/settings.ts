import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  defaultAppConfig,
  isInterfaceDensity,
  isThemePreference,
  type AgentProviderPreference,
  type AppConfigEncoded as AppConfigState,
  type InterfaceDensity,
  type LocalWorkspacePreferencesPatch,
  type ProfileConfig,
  type ThemePreference,
} from "@cycle/config";
import type { ProfileUpdateInput } from "../../shared/Profile.ts";
import { cycleApiClient } from "../lib/cycleApiClient.ts";
import { getDesktopBridge } from "../lib/desktopBridge.ts";
import { appConfigQueryKey } from "../queries/appConfig.ts";
import { agentProvidersQueryKey } from "../queries/agentProviders.ts";
import type { AgentProviderId } from "@cycle/contracts/schemas/agents";

type SettingsMutationOptions = {
  readonly appConfig?: AppConfigState;
};

export const useUpdateProfileMutation = ({ appConfig }: SettingsMutationOptions = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ProfileUpdateInput): Promise<ProfileConfig> => {
      return cycleApiClient.updateProfile(input);
    },
    onSuccess: (profile) => {
      queryClient.setQueryData<AppConfigState>(appConfigQueryKey, (current) => {
        const state = current ?? appConfig ?? defaultAppConfig();
        return {
          ...state,
          profile,
        };
      });
    },
  });
};

export const useSetThemePreferenceMutation = (_options: SettingsMutationOptions = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (preference: ThemePreference): Promise<AppConfigState> => {
      if (!isThemePreference(preference)) {
        throw new TypeError("preference must be light, dark, or system.");
      }

      return cycleApiClient.setThemePreference(preference);
    },
    onSuccess: (next) => {
      queryClient.setQueryData(appConfigQueryKey, next);
    },
  });
};

export const useSetInterfaceDensityMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (density: InterfaceDensity): Promise<AppConfigState> => {
      if (!isInterfaceDensity(density)) {
        throw new TypeError("density must be compact or spacious.");
      }

      return cycleApiClient.setInterfaceDensity(density);
    },
    onSuccess: (next) => {
      queryClient.setQueryData(appConfigQueryKey, next);
    },
  });
};

export const useUpdateLocalWorkspacePreferencesMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (preferences: LocalWorkspacePreferencesPatch): Promise<AppConfigState> =>
      cycleApiClient.updateLocalWorkspacePreferences(preferences),
    onSuccess: (next) => {
      queryClient.setQueryData(appConfigQueryKey, next);
    },
  });
};

export const useClearCacheMutation = () =>
  useMutation({
    mutationFn: async () => {
      await getDesktopBridge()?.clearCache();
    },
  });

export const useUpdateAgentProviderPreferenceMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      readonly providerId: AgentProviderId;
      readonly preference: Partial<Omit<AgentProviderPreference, "id">>;
    }): Promise<AppConfigState> =>
      cycleApiClient.updateAgentProviderPreference(input.providerId, input.preference),
    onSuccess: (next) => {
      queryClient.setQueryData(appConfigQueryKey, next);
      void queryClient.invalidateQueries({ queryKey: agentProvidersQueryKey });
    },
  });
};
