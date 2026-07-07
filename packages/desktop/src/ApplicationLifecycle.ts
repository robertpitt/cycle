import { BackendShellServicesLive } from "@cycle/backend";
import { Layer } from "effect";
import { DesktopLoggerLive } from "./DesktopLogger.ts";
import { ElectronPreferences } from "./ElectronPreferences.ts";

const BackendShellLive = BackendShellServicesLive();

const ElectronPreferencesServiceLive = ElectronPreferences.defaultLayer.pipe(
  Layer.provide(BackendShellLive),
);

export const ApplicationLifecycleLive = Layer.mergeAll(
  BackendShellLive,
  ElectronPreferencesServiceLive,
  DesktopLoggerLive,
);
