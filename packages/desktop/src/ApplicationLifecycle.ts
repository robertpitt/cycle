import { AgentProviderDetectorLive } from "@cycle/agents/detection";
import { AppConfigLive } from "@cycle/config/app-config-live";
import { GitRepositoryLive, WorktreeServiceLive } from "@cycle/git";
import { Layer } from "effect";
import { DesktopApiLive } from "./DesktopApi.ts";
import { DesktopBootstrapLive } from "./DesktopBootstrapLive.ts";
import { DesktopDatabaseLive } from "./DesktopDatabaseLive.ts";
import { DesktopLoggerLive } from "./DesktopLoggerLive.ts";
import { ElectronPreferences } from "./ElectronPreferences.ts";
import { LocalWorkspaceLive } from "./LocalWorkspaceLive.ts";
import { ProfileLive } from "./ProfileLive.ts";

const AppConfigServiceLive = AppConfigLive;

const ProfileServiceLive = ProfileLive.pipe(Layer.provide(AppConfigServiceLive));

const LocalWorkspaceServiceLive = LocalWorkspaceLive.pipe(
  Layer.provide(Layer.mergeAll(AppConfigServiceLive, GitRepositoryLive)),
);

const ElectronPreferencesServiceLive = ElectronPreferences.defaultLayer.pipe(
  Layer.provide(
    Layer.mergeAll(AppConfigServiceLive, LocalWorkspaceServiceLive, ProfileServiceLive),
  ),
);

const DesktopDatabaseServiceLive = DesktopDatabaseLive.pipe(Layer.provide(ProfileServiceLive));

const DesktopBootstrapServiceLive = DesktopBootstrapLive.pipe(
  Layer.provide(
    Layer.mergeAll(
      DesktopDatabaseServiceLive,
      DesktopLoggerLive,
      ElectronPreferencesServiceLive,
      GitRepositoryLive,
      WorktreeServiceLive,
      LocalWorkspaceServiceLive,
    ),
  ),
);

export const ApplicationLifecycleLive = Layer.mergeAll(
  AppConfigServiceLive,
  ProfileServiceLive,
  ElectronPreferencesServiceLive,
  DesktopLoggerLive,
  DesktopApiLive,
  GitRepositoryLive,
  WorktreeServiceLive,
  LocalWorkspaceServiceLive,
  DesktopDatabaseServiceLive,
  AgentProviderDetectorLive,
  DesktopBootstrapServiceLive,
);
