import { Layer } from "effect";
import { BrowserWindowsLive } from "../platform/BrowserWindowsLive.ts";
import { ElectronAppLive } from "../platform/ElectronAppLive.ts";
import { ElectronShellLive } from "../platform/ElectronShellLive.ts";
import { ProcessLifecycleLive } from "../platform/ProcessLifecycleLive.ts";
import { DesktopConfigLive } from "../shared/DesktopConfigLive.ts";
import { AgentProviderDetectorLive } from "./AgentProviderDetectorLive.ts";
import { AppConfigLive } from "./AppConfigLive.ts";
import { DesktopWindowLive } from "./DesktopWindowLive.ts";
import { LocalWorkspaceLive } from "./LocalWorkspaceLive.ts";
import { ProfileLive } from "./ProfileLive.ts";

const ElectronAppServiceLive = ElectronAppLive.pipe(Layer.provide(ProcessLifecycleLive));

const DesktopWindowDependenciesLive = Layer.mergeAll(BrowserWindowsLive, DesktopConfigLive);

const DesktopWindowServiceLive = DesktopWindowLive.pipe(
  Layer.provide(DesktopWindowDependenciesLive),
);

const AppConfigServiceLive = AppConfigLive.pipe(Layer.provide(ElectronAppServiceLive));

const ProfileServiceLive = ProfileLive.pipe(Layer.provide(AppConfigServiceLive));

const LocalWorkspaceServiceLive = LocalWorkspaceLive.pipe(Layer.provide(AppConfigServiceLive));

export const DesktopLive = Layer.mergeAll(
  ElectronAppServiceLive,
  DesktopWindowServiceLive,
  ElectronShellLive,
  AppConfigServiceLive,
  ProfileServiceLive,
  LocalWorkspaceServiceLive,
  AgentProviderDetectorLive,
);
