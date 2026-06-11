import { TicketRpcLive } from "@cycle/rpc/server";
import { UseCaseRunnerLive } from "@cycle/usecases";
import { GitRepository } from "@cycle/git";
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

const DesktopWindowDependenciesLive = Layer.mergeAll(
  BrowserWindowsLive,
  DesktopConfigLive,
  DesktopRuntimeLive,
);

const DesktopWindowServiceLive = DesktopWindowLive.pipe(
  Layer.provide(DesktopWindowDependenciesLive),
);

const AppConfigServiceLive = AppConfigLive.pipe(Layer.provide(ElectronAppServiceLive));

const ProfileServiceLive = ProfileLive.pipe(Layer.provide(AppConfigServiceLive));

const GitRepositoryServiceLive = GitRepository.NodeLive;

const DesktopLoggerServiceLive = DesktopLoggerLive.pipe(Layer.provide(ElectronAppServiceLive));

const LocalWorkspaceServiceLive = LocalWorkspaceLive.pipe(
  Layer.provide(Layer.mergeAll(AppConfigServiceLive, GitRepositoryServiceLive)),
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
  Layer.provide(
    Layer.mergeAll(
      ProfileServiceLive,
      ElectronAppServiceLive,
      DesktopLoggerServiceLive,
      DesktopRuntimeLive,
    ),
  ),
);

const DatabaseConsumerDependenciesLive = Layer.mergeAll(
  DesktopDatabaseServiceLive,
  UseCaseRunnerLive.pipe(Layer.provide(DesktopDatabaseServiceLive)),
  DesktopLoggerServiceLive,
  DesktopRuntimeLive,
  ElectronPreferencesServiceLive,
  GitRepositoryServiceLive,
);

const DatabaseConsumersLive = Layer.mergeAll(TicketRpcLive, DesktopBootstrapLive).pipe(
  Layer.provide(DatabaseConsumerDependenciesLive),
);

export const DesktopLive = Layer.mergeAll(
  DesktopRuntimeLive,
  ElectronAppServiceLive,
  ElectronThemeServiceLive,
  DesktopWindowServiceLive,
  ElectronShellLive,
  AppConfigServiceLive,
  ProfileServiceLive,
  ElectronPreferencesServiceLive,
  DesktopLoggerServiceLive,
  GitRepositoryServiceLive,
  LocalWorkspaceServiceLive,
  AgentProviderDetectorLive,
  DatabaseConsumersLive,
);
