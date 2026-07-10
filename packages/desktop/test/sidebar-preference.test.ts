import { describe, expect, it } from "vitest";
import {
  readSidebarCollapsed,
  sidebarCollapsedStorageKey,
  toggleSidebarCollapsed,
  writeSidebarCollapsed,
  type SidebarPreferenceStorage,
} from "../src/renderer/screens/workspace/sidebarPreference.ts";

const storage = (
  initial?: string,
): SidebarPreferenceStorage & { readonly values: Map<string, string> } => {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(sidebarCollapsedStorageKey, initial);

  return {
    get values() {
      return values;
    },
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
};

describe("sidebar preference", () => {
  it("defaults to expanded and restores only a persisted collapsed state", () => {
    expect(readSidebarCollapsed(undefined)).toBe(false);
    expect(readSidebarCollapsed(storage())).toBe(false);
    expect(readSidebarCollapsed(storage("false"))).toBe(false);
    expect(readSidebarCollapsed(storage("invalid"))).toBe(false);
    expect(readSidebarCollapsed(storage("true"))).toBe(true);
  });

  it("persists visible toggle interactions in both directions", () => {
    const target = storage();

    expect(toggleSidebarCollapsed(target, false)).toBe(true);
    expect(target.values.get(sidebarCollapsedStorageKey)).toBe("true");
    expect(toggleSidebarCollapsed(target, true)).toBe(false);
    expect(target.values.get(sidebarCollapsedStorageKey)).toBe("false");
  });

  it("does not let unavailable storage block interaction", () => {
    const unavailable: SidebarPreferenceStorage = {
      getItem: () => {
        throw new Error("unavailable");
      },
      setItem: () => {
        throw new Error("unavailable");
      },
    };

    expect(readSidebarCollapsed(unavailable)).toBe(false);
    expect(() => writeSidebarCollapsed(unavailable, true)).not.toThrow();
    expect(toggleSidebarCollapsed(unavailable, false)).toBe(true);
  });
});
