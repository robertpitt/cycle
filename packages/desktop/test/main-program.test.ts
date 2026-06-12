import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { runDesktopStartupWorkflow, type DesktopStartupWorkflow } from "../src/main/MainProgram.ts";

const makeWorkflow = (
  events: Array<string>,
  overrides: Partial<DesktopStartupWorkflow> = {},
): DesktopStartupWorkflow => ({
  awaitShutdown: Effect.sync(() => {
    events.push("awaitShutdown");
  }),
  createMainWindow: Effect.sync(() => {
    events.push("createMainWindow");
  }),
  destroyAllWindows: Effect.sync(() => {
    events.push("destroyAllWindows");
  }),
  registerIpcHandlers: Effect.sync(() => {
    events.push("registerIpcHandlers");
  }),
  startAppLifecycleSupervision: Effect.sync(() => {
    events.push("startAppLifecycleSupervision");
  }),
  startBootstrapSupervision: Effect.sync(() => {
    events.push("startBootstrapSupervision");
  }),
  startThemeLifecycleSupervision: Effect.sync(() => {
    events.push("startThemeLifecycleSupervision");
  }),
  syncThemePreference: Effect.sync(() => {
    events.push("syncThemePreference");
  }),
  waitForElectronReady: Effect.sync(() => {
    events.push("waitForElectronReady");
  }),
  ...overrides,
});

describe("desktop startup workflow", () => {
  it("runs startup steps in the Section 11 order", async () => {
    const events: Array<string> = [];

    await Effect.runPromise(Effect.scoped(runDesktopStartupWorkflow(makeWorkflow(events))));

    expect(events).toEqual([
      "waitForElectronReady",
      "syncThemePreference",
      "registerIpcHandlers",
      "startThemeLifecycleSupervision",
      "startAppLifecycleSupervision",
      "createMainWindow",
      "startBootstrapSupervision",
      "awaitShutdown",
      "destroyAllWindows",
    ]);
  });

  it("destroys windows when startup fails before shutdown", async () => {
    const events: Array<string> = [];

    await expect(
      Effect.runPromise(
        Effect.scoped(
          runDesktopStartupWorkflow(
            makeWorkflow(events, {
              startBootstrapSupervision: Effect.sync(() => {
                events.push("startBootstrapSupervision");
              }).pipe(Effect.andThen(Effect.fail(new Error("bootstrap failed")))),
            }),
          ),
        ),
      ),
    ).rejects.toThrow("bootstrap failed");

    expect(events).toEqual([
      "waitForElectronReady",
      "syncThemePreference",
      "registerIpcHandlers",
      "startThemeLifecycleSupervision",
      "startAppLifecycleSupervision",
      "createMainWindow",
      "startBootstrapSupervision",
      "destroyAllWindows",
    ]);
  });
});
