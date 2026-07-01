import {
  ApplicationSettingsPanel as UiApplicationSettingsPanel,
  type ApplicationSettingsSection as UiApplicationSettingsSection,
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
import { ApplicationAgentSettingsPanel } from "./AgentWorkPanels.tsx";
import type { DetectedAgentProvider } from "../../shared/AgentProviders.ts";

export type ApplicationSettingsSection = UiApplicationSettingsSection | "agents";

type ApplicationSettingsPanelProps = {
  readonly agentProviders?: readonly DetectedAgentProvider[];
  readonly appConfig: AppConfigState;
  readonly section: ApplicationSettingsSection;
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

export const ApplicationSettingsPanel = ({
  agentProviders = [],
  appConfig,
  section,
}: ApplicationSettingsPanelProps) => {
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

  if (section === "agents") {
    return <ApplicationAgentSettingsPanel providers={agentProviders} />;
  }

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
      section={section}
      themeItems={themeItems}
      themePreference={appConfig.theme.preference}
    />
  );
};
