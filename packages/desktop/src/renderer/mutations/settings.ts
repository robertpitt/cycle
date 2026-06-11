import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  defaultAppConfig,
  isThemePreference,
  type AppConfigState,
  type ProfileConfig,
  type ThemePreference,
} from "../../shared/AppConfig.ts";
import type { ProfileUpdateInput } from "../../shared/Profile.ts";
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
      if (bridge) return bridge.updateProfile(input);

      const current = appConfig ?? defaultAppConfig();
      return {
        displayName: input.displayName?.trim() ?? current.profile.displayName,
        email: input.email?.trim() ?? current.profile.email,
      };
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

export const useSetThemePreferenceMutation = ({ appConfig }: SettingsMutationOptions = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (preference: ThemePreference): Promise<AppConfigState> => {
      if (!isThemePreference(preference)) {
        throw new TypeError("preference must be light, dark, or system.");
      }

      const bridge = getDesktopBridge();
      if (bridge) return bridge.setThemePreference(preference);

      return {
        ...(appConfig ?? defaultAppConfig()),
        theme: {
          preference,
        },
      };
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
