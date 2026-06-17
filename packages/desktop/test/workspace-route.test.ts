import { describe, expect, it } from "vitest";
import {
  invalidRepositoryFallbackPath,
  lastWorkspaceRouteStorageKey,
  parentWorkspacePath,
  parseWorkspacePath,
  readStoredWorkspacePath,
  toWorkspacePath,
  writeStoredWorkspacePath,
  type WorkspaceRouteStorage,
} from "../src/renderer/screens/workspace/workspaceRoute.ts";

const storage = (
  initial?: string,
): WorkspaceRouteStorage & { readonly values: Map<string, string> } => {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(lastWorkspaceRouteStorageKey, initial);

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

describe("workspace route helpers", () => {
  it("round-trips top-level workspace paths", () => {
    expect(parseWorkspacePath("/inbox")).toEqual({
      page: "inbox",
      scope: "workspace",
    });
    expect(parseWorkspacePath("/chat")).toEqual({
      page: "chat",
      scope: "workspace",
    });
    expect(parseWorkspacePath("#/initiatives")).toEqual({
      page: "initiatives",
      scope: "workspace",
    });
    expect(
      toWorkspacePath({
        page: "settings",
        scope: "workspace",
      }),
    ).toBe("/settings");
  });

  it("round-trips repository issue paths", () => {
    const location = parseWorkspacePath("/repositories/repo%3Aone/issues/CYC-123");

    expect(location).toEqual({
      issueId: "CYC-123",
      page: "issues",
      repositoryId: "repo:one",
      scope: "repository",
    });
    expect(location ? toWorkspacePath(location) : undefined).toBe(
      "/repositories/repo%3Aone/issues/CYC-123",
    );
  });

  it("round-trips repository saved view paths", () => {
    expect(parseWorkspacePath("/repositories/repo-a/views/view-1/issues/ticket-2")).toEqual({
      issueId: "ticket-2",
      page: "views",
      repositoryId: "repo-a",
      scope: "repository",
      viewId: "view-1",
    });
    expect(
      toWorkspacePath({
        page: "views",
        repositoryId: "repo-a",
        scope: "repository",
        viewId: "view-1",
      }),
    ).toBe("/repositories/repo-a/views/view-1");
  });

  it("rejects malformed workspace paths", () => {
    expect(parseWorkspacePath("/")).toBeUndefined();
    expect(parseWorkspacePath("/repositories/repo-a")).toBeUndefined();
    expect(parseWorkspacePath("/repositories/repo-a/views/view-1/issues")).toBeUndefined();
    expect(parseWorkspacePath("/repositories/repo-a/issues/ticket/extra")).toBeUndefined();
    expect(parseWorkspacePath("/unknown")).toBeUndefined();
  });

  it("returns hierarchy fallback parents", () => {
    expect(
      parentWorkspacePath({
        issueId: "ticket-1",
        page: "issues",
        repositoryId: "repo-a",
        scope: "repository",
      }),
    ).toBe("/repositories/repo-a/issues");
    expect(
      parentWorkspacePath({
        issueId: "ticket-1",
        page: "views",
        repositoryId: "repo-a",
        scope: "repository",
        viewId: "view-1",
      }),
    ).toBe("/repositories/repo-a/views/view-1");
    expect(
      parentWorkspacePath({
        page: "views",
        repositoryId: "repo-a",
        scope: "repository",
        viewId: "view-1",
      }),
    ).toBe("/repositories/repo-a/views");
    expect(
      parentWorkspacePath({
        page: "history",
        repositoryId: "repo-a",
        scope: "repository",
      }),
    ).toBe("/issues");
    expect(
      parentWorkspacePath({
        page: "views",
        scope: "workspace",
      }),
    ).toBe("/inbox");
  });

  it("validates stored last workspace routes", () => {
    expect(readStoredWorkspacePath(storage("/repositories/repo-a/issues/ticket-1"))).toBe(
      "/repositories/repo-a/issues/ticket-1",
    );
    expect(readStoredWorkspacePath(storage("/not-workspace"))).toBeUndefined();

    const target = storage();
    writeStoredWorkspacePath(target, "/repositories/repo-a/history");
    writeStoredWorkspacePath(target, "/bad");
    expect(target.values.get(lastWorkspaceRouteStorageKey)).toBe("/repositories/repo-a/history");
  });

  it("chooses invalid repository fallback paths", () => {
    expect(invalidRepositoryFallbackPath(true)).toBe("/issues");
    expect(invalidRepositoryFallbackPath(false)).toBe("/inbox");
  });
});
