import { defaultAppConfig } from "@cycle/config";
import { describe, expect, it } from "vitest";
import { applyLocalWorkspacePreferences } from "../src/renderer/mutations/settings.ts";

describe("settings mutations", () => {
  it("applies sidebar preferences without dropping workspace repositories", () => {
    const current = defaultAppConfig();
    const repositories = [
      {
        addedAt: "2026-07-10T00:00:00.000Z",
        displayName: "cycle",
        id: "repo_16371",
        path: "/workspaces/cycle",
        preferences: {
          autoSync: true,
          commitStyle: "descriptive" as const,
          sidebarExpanded: true,
        },
      },
    ];

    const next = applyLocalWorkspacePreferences(
      {
        ...current,
        localWorkspace: {
          ...current.localWorkspace,
          repositories,
        },
      },
      { sidebarCollapsed: true },
    );

    expect(next.localWorkspace.sidebarCollapsed).toBe(true);
    expect(next.localWorkspace.repositories).toBe(repositories);
  });

  it("can optimistically restore the expanded sidebar state", () => {
    const current = defaultAppConfig();
    const next = applyLocalWorkspacePreferences(
      {
        ...current,
        localWorkspace: {
          ...current.localWorkspace,
          sidebarCollapsed: true,
        },
      },
      { sidebarCollapsed: false },
    );

    expect(next.localWorkspace.sidebarCollapsed).toBe(false);
  });
});
