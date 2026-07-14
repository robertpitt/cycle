import { describe, expect, it } from "vitest";
import {
  isApiHost,
  isInterfaceDensity,
  isRepositoryCommitStyle,
  isThemePreference,
} from "../src/schemas/app/index.ts";

describe("app settings contracts", () => {
  it("accepts the persisted desktop and API preference values", () => {
    expect(["127.0.0.1", "localhost"].every(isApiHost)).toBe(true);
    expect(["light", "dark", "system"].every(isThemePreference)).toBe(true);
    expect(["compact", "spacious"].every(isInterfaceDensity)).toBe(true);
    expect(["descriptive", "compact"].every(isRepositoryCommitStyle)).toBe(true);
  });

  it("rejects unsupported settings values", () => {
    expect(isApiHost("0.0.0.0")).toBe(false);
    expect(isThemePreference("sepia")).toBe(false);
    expect(isInterfaceDensity("comfortable")).toBe(false);
    expect(isRepositoryCommitStyle("verbose")).toBe(false);
  });
});
