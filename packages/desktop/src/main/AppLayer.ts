import { defaultLayer as CycleLoggingLive } from "@cycle/logging";
import { NodeServices } from "@effect/platform-node";
import { Layer } from "effect";
import { ApplicationLifecycleLive } from "../ApplicationLifecycle.ts";
import { ElectronLifecycleLive } from "../ElectronLifecycle.ts";

const DesktopServicesLive = ApplicationLifecycleLive.pipe(Layer.provideMerge(ElectronLifecycleLive));

export const DesktopLive = DesktopServicesLive.pipe(
  Layer.provideMerge(NodeServices.layer),
  Layer.provide(CycleLoggingLive({ console: false, packageName: "desktop" })),
);
