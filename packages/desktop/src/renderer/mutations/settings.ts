import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  defaultAppConfig,
  isThemePreference,
  type AppConfigState,
  type ProfileConfig,
  type ThemePreference,
} from "../../shared/AppConfig.ts";
import type { ProfileUpdateInput } from "../../shared/Profile.ts";
import { cycleApiClient } from "../lib/cycleApiClient.ts";
import { getDesktopBridge } from "../lib/desktopBridge.ts";
import { appConfigQueryKey } from "../queries/appConfig.ts";

type SettingsMutationOptions = {
  readonly appConfig?: AppConfigState;
};

export const useUpdateProfileMutation = ({ appConfig }: SettingsMutationOptions = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ProfileUpdateInput): Promise<ProfileConfig> => {
      const bridge = getDesktopBridge();

      try {
        return await cycleApiClient.updateProfile(input);
      } catch (error) {
        if (bridge) return bridge.updateProfile(input);
        throw error;
      }
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

      const bridge = getDesktopBridge();

      try {
        return await cycleApiClient.setThemePreference(preference);
      } catch (error) {
        if (bridge) return bridge.setThemePreference(preference);
        throw error;
      }
    },
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
