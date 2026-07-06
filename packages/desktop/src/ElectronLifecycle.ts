import { Layer } from "effect";
import { DesktopWindowLive } from "./DesktopWindowLive.ts";
import { ElectronAppLive } from "./ElectronApp.ts";
import { ElectronRuntimeLive } from "./ElectronRuntime.ts";
import { ElectronShellLive } from "./ElectronShell.ts";
import { ElectronThemeLive } from "./ElectronTheme.ts";
import { ElectronWindowLive } from "./ElectronWindow.ts";
import { ProcessLifecycleLive } from "./ProcessLifecycle.ts";
import { DesktopConfigLive } from "./shared/DesktopConfigLive.ts";

const ElectronAppServiceLive = ElectronAppLive.pipe(
  Layer.provide(Layer.mergeAll(ProcessLifecycleLive, ElectronRuntimeLive)),
);

const ElectronThemeServiceLive = ElectronThemeLive.pipe(Layer.provide(ElectronRuntimeLive));

const DesktopWindowServiceLive = DesktopWindowLive.pipe(
  Layer.provide(Layer.mergeAll(ElectronWindowLive, DesktopConfigLive, ElectronRuntimeLive)),
);

export const ElectronLifecycleLive = Layer.mergeAll(
  ElectronRuntimeLive,
  ElectronAppServiceLive,
  ElectronThemeServiceLive,
  DesktopWindowServiceLive,
  ElectronShellLive,
);
