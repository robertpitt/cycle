import { describe, expect, it } from "vitest";
import {
  BackendRuntime,
  BackendServicesLive,
  BackendShellServicesLive,
  launchBackend,
  startBackend,
} from "../src/index.ts";

describe("@cycle/backend exports", () => {
  it("exposes backend runtime entrypoints", () => {
    expect(BackendRuntime).toBeDefined();
    expect(BackendServicesLive).toBeDefined();
    expect(BackendShellServicesLive).toBeDefined();
    expect(typeof launchBackend).toBe("function");
    expect(typeof startBackend).toBe("function");
  });
});
