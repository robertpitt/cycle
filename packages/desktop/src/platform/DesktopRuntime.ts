import { Context, Effect } from "effect";

export type DesktopRuntimeService = {
  readonly run: (label: string, effect: Effect.Effect<void, unknown>) => void;
  readonly runPromise: <A>(label: string, effect: Effect.Effect<A, unknown>) => Promise<A>;
};

export class DesktopRuntime extends Context.Service<DesktopRuntime, DesktopRuntimeService>()(
  "@cycle/desktop/DesktopRuntime",
) {}
