import { useQuery } from "@tanstack/react-query";
import type { RepositoryStatus } from "@cycle/contracts";
import {
  defaultAppConfig,
  defaultRepositoryPreferences,
  type AppConfigState,
  type RepositoryRecord,
} from "../../shared/AppConfig.ts";
import { cycleApiClient } from "../lib/cycleApiClient.ts";
import { getDesktopBridge } from "../lib/desktopBridge.ts";

export const appConfigQueryKey = ["desktop", "appConfig"] as const;

const displayNameFromPath = (path: string): string =>
  path.split(/[\\/]/u).filter(Boolean).at(-1) ?? path;

const repositoryRecordFromStatus = (status: RepositoryStatus): RepositoryRecord => {
  const path = status.metadata?.worktreePath ?? status.metadata?.gitDir ?? status.repositoryId;

  return {
    addedAt:
      status.cycleMetadata?.createdAt ??
      status.lastSyncCompletedAt ??
      status.lastSyncStartedAt ??
      new Date().toISOString(),
    displayName: displayNameFromPath(path),
    id: status.repositoryId,
    path,
    preferences: defaultRepositoryPreferences(),
  };
};

const getRendererAppConfig = async (): Promise<AppConfigState> => {
  const bridge = getDesktopBridge();
  if (bridge) return bridge.getAppConfig();

  const repositories = await cycleApiClient.listRepositories();

  return {
    ...defaultAppConfig(),
    localWorkspace: {
      repositories: repositories.map(repositoryRecordFromStatus),
    },
    onboarding: {
      completed: true,
    },
    profile: {
      displayName: "Browser",
      email: "browser@localhost",
    },
  };
};

export const useAppConfigQuery = () =>
  useQuery({
    queryFn: getRendererAppConfig,
    queryKey: appConfigQueryKey,
  });
