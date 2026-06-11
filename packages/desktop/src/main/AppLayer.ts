import { TicketRpcLive } from "@cycle/rpc/server";
import { GitRepositoryLive } from "@cycle/git";
import { Layer } from "effect";
import { BrowserWindowsLive } from "../platform/BrowserWindowsLive.ts";
import { ElectronAppLive } from "../platform/ElectronAppLive.ts";
import { ElectronShellLive } from "../platform/ElectronShellLive.ts";
import { ProcessLifecycleLive } from "../platform/ProcessLifecycleLive.ts";
import { DesktopConfigLive } from "../shared/DesktopConfigLive.ts";
import { AgentProviderDetectorLive } from "./AgentProviderDetectorLive.ts";
import { AppConfigLive } from "./AppConfigLive.ts";
import { DesktopBootstrapLive } from "./DesktopBootstrapLive.ts";
import { DesktopWindowLive } from "./DesktopWindowLive.ts";
import { DesktopDatabaseLive } from "./DesktopDatabaseLive.ts";
import { DesktopLoggerLive } from "./DesktopLoggerLive.ts";
import { LocalWorkspaceLive } from "./LocalWorkspaceLive.ts";
import { ProfileLive } from "./ProfileLive.ts";

const ElectronAppServiceLive = ElectronAppLive.pipe(Layer.provide(ProcessLifecycleLive));

const DesktopWindowDependenciesLive = Layer.mergeAll(BrowserWindowsLive, DesktopConfigLive);

const DesktopWindowServiceLive = DesktopWindowLive.pipe(
  Layer.provide(DesktopWindowDependenciesLive),
);

const AppConfigServiceLive = AppConfigLive.pipe(Layer.provide(ElectronAppServiceLive));

const ProfileServiceLive = ProfileLive.pipe(Layer.provide(AppConfigServiceLive));

const GitRepositoryServiceLive = GitRepositoryLive.NodeLive;

const DesktopLoggerServiceLive = DesktopLoggerLive.pipe(Layer.provide(ElectronAppServiceLive));

const LocalWorkspaceServiceLive = LocalWorkspaceLive.pipe(
  Layer.provide(Layer.mergeAll(AppConfigServiceLive, GitRepositoryServiceLive)),
);

const DesktopDatabaseServiceLive = DesktopDatabaseLive.pipe(
  Layer.provide(
    Layer.mergeAll(ProfileServiceLive, ElectronAppServiceLive, DesktopLoggerServiceLive),
  ),
);

const DatabaseConsumerDependenciesLive = Layer.mergeAll(
  AppConfigServiceLive,
  DesktopDatabaseServiceLive,
  DesktopLoggerServiceLive,
  GitRepositoryServiceLive,
);

const DatabaseConsumersLive = Layer.mergeAll(TicketRpcLive, DesktopBootstrapLive).pipe(
  Layer.provide(DatabaseConsumerDependenciesLive),
);

export const DesktopLive = Layer.mergeAll(
  ElectronAppServiceLive,
  DesktopWindowServiceLive,
  ElectronShellLive,
  AppConfigServiceLive,
  ProfileServiceLive,
  DesktopLoggerServiceLive,
  GitRepositoryServiceLive,
  LocalWorkspaceServiceLive,
  AgentProviderDetectorLive,
  DatabaseConsumersLive,
);
