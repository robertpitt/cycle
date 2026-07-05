import { ExecutableResolverLive } from "@cycle/agents/executables";
import { GitRepositoryLive, WorktreeServiceLive } from "@cycle/git";
import { defaultLayer as CycleLoggingLive } from "@cycle/logging";
import { NodeServices } from "@effect/platform-node";
import { Layer } from "effect";
import { BrowserWindowsLive } from "../platform/BrowserWindowsLive.ts";
import { DesktopRuntimeLive } from "../platform/DesktopRuntimeLive.ts";
import { ElectronAppLive } from "../platform/ElectronAppLive.ts";
import { ElectronShellLive } from "../platform/ElectronShellLive.ts";
import { ElectronThemeLive } from "../platform/ElectronThemeLive.ts";
import { ProcessLifecycleLive } from "../platform/ProcessLifecycleLive.ts";
import { DesktopConfigLive } from "../shared/DesktopConfigLive.ts";
import { AgentProviderDetectorLive } from "./AgentProviderDetectorLive.ts";
import { AppConfigLive } from "./AppConfigLive.ts";
import { DesktopBootstrapLive } from "./DesktopBootstrapLive.ts";
import { DesktopWindowLive } from "./DesktopWindowLive.ts";
import { DesktopDatabaseLive } from "./DesktopDatabaseLive.ts";
import { DesktopLoggerLive } from "./DesktopLoggerLive.ts";
import { ElectronPreferences } from "./ElectronPreferences.ts";
import { LocalWorkspaceLive } from "./LocalWorkspaceLive.ts";
import { ProfileLive } from "./ProfileLive.ts";

const ElectronAppServiceLive = ElectronAppLive.pipe(
  Layer.provide(Layer.mergeAll(ProcessLifecycleLive, DesktopRuntimeLive)),
);

const ElectronThemeServiceLive = ElectronThemeLive.pipe(Layer.provide(DesktopRuntimeLive));

const DesktopWindowServiceLive = DesktopWindowLive.pipe(
  Layer.provide(Layer.mergeAll(BrowserWindowsLive, DesktopConfigLive, DesktopRuntimeLive)),
);

const AppConfigServiceLive = AppConfigLive.pipe(Layer.provide(ElectronAppServiceLive));

const ProfileServiceLive = ProfileLive.pipe(Layer.provide(AppConfigServiceLive));

const DesktopLoggerServiceLive = DesktopLoggerLive;

const LocalWorkspaceServiceLive = LocalWorkspaceLive.pipe(
  Layer.provide(Layer.mergeAll(AppConfigServiceLive, GitRepositoryLive)),
);

const ElectronPreferencesServiceLive = ElectronPreferences.defaultLayer.pipe(
  Layer.provide(
    Layer.mergeAll(
      AppConfigServiceLive,
      ElectronThemeServiceLive,
      LocalWorkspaceServiceLive,
      ProfileServiceLive,
    ),
  ),
);

const DesktopDatabaseServiceLive = DesktopDatabaseLive.pipe(
  Layer.provide(Layer.mergeAll(ProfileServiceLive, ElectronAppServiceLive)),
);

const DatabaseConsumerDependenciesLive = Layer.mergeAll(
  DesktopDatabaseServiceLive,
  DesktopLoggerServiceLive,
  DesktopRuntimeLive,
  ElectronPreferencesServiceLive,
  GitRepositoryLive,
  WorktreeServiceLive,
  LocalWorkspaceServiceLive,
);

const DatabaseConsumersLive = DesktopBootstrapLive.pipe(
  Layer.provide(DatabaseConsumerDependenciesLive),
);

const DesktopServicesLive = Layer.mergeAll(
  DesktopRuntimeLive,
  ElectronAppServiceLive,
  ElectronThemeServiceLive,
  DesktopWindowServiceLive,
  ElectronShellLive,
  AppConfigServiceLive,
  ProfileServiceLive,
  ElectronPreferencesServiceLive,
  DesktopLoggerServiceLive,
  GitRepositoryLive,
  WorktreeServiceLive,
  LocalWorkspaceServiceLive,
  DesktopDatabaseServiceLive,
  ExecutableResolverLive,
  AgentProviderDetectorLive,
  DatabaseConsumersLive,
);

export const DesktopLive = DesktopServicesLive.pipe(
  Layer.provide(NodeServices.layer),
  Layer.provideMerge(NodeServices.layer),
  Layer.provide(CycleLoggingLive({ console: false, packageName: "desktop" })),
);
