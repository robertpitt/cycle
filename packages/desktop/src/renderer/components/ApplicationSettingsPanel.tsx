import {
  ApplicationSettingsPanel as UiApplicationSettingsPanel,
  type ApplicationSettingsProfile,
} from "@cycle/ui/organisms";
import * as React from "react";
import {
  isThemePreference,
  type AppConfigState,
  type ThemePreference,
} from "../../shared/AppConfig.ts";
import {
  useClearCacheMutation,
  useSetThemePreferenceMutation,
  useUpdateProfileMutation,
} from "../mutations/index.ts";

type ApplicationSettingsPanelProps = {
  readonly appConfig: AppConfigState;
};

const themeItems = [
  {
    label: "System",
    value: "system",
  },
  {
    label: "Light",
    value: "light",
  },
  {
    label: "Dark",
    value: "dark",
  },
] satisfies ReadonlyArray<{ readonly label: string; readonly value: ThemePreference }>;

export const ApplicationSettingsPanel = ({ appConfig }: ApplicationSettingsPanelProps) => {
  const [cacheCleared, setCacheCleared] = React.useState(false);
  const updateProfile = useUpdateProfileMutation({ appConfig });
  const setThemePreference = useSetThemePreferenceMutation({ appConfig });
  const clearCache = useClearCacheMutation();

  const saveProfile = (profile: ApplicationSettingsProfile) => {
    updateProfile.mutate(profile);
  };

  const changeTheme = (value: string) => {
    if (!isThemePreference(value) || value === appConfig.theme.preference) return;
    setThemePreference.mutate(value);
  };

  const clearRendererCache = () => {
    setCacheCleared(false);
    clearCache.mutate(undefined, {
      onSuccess: () => setCacheCleared(true),
    });
  };

  return (
    <UiApplicationSettingsPanel
      cacheCleared={cacheCleared}
      cacheError={
        clearCache.error
          ? clearCache.error instanceof Error
            ? clearCache.error.message
            : "Unable to clear cache."
          : undefined
      }
      cacheLoading={clearCache.isPending}
      onCacheClear={clearRendererCache}
      onProfileSave={saveProfile}
      onThemePreferenceChange={changeTheme}
      profile={{
        displayName: appConfig.profile.displayName,
        email: appConfig.profile.email,
      }}
      profileError={
        updateProfile.error
          ? updateProfile.error instanceof Error
            ? updateProfile.error.message
            : "Unable to save profile."
          : undefined
      }
      profileLoading={updateProfile.isPending}
      themeItems={themeItems}
      themePreference={appConfig.theme.preference}
    />
  );
};
