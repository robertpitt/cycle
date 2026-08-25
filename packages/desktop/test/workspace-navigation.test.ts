import { defaultRepositoryPreferences, type RepositoryRecord } from "@cycle/config";
import { describe, expect, it } from "vitest";
import { createRendererNavSections } from "../src/renderer/screens/workspace/navigation.tsx";

const repository = (
  id: string,
  preferences: Partial<RepositoryRecord["preferences"]> = {},
): RepositoryRecord => ({
  addedAt: "2026-08-25T00:00:00.000Z",
  displayName: id,
  id,
  path: `/tmp/${id}`,
  preferences: {
    ...defaultRepositoryPreferences(),
    ...preferences,
  },
});

describe("workspace repository navigation", () => {
  it("places grouped and archived repositories into dedicated sidebar sections", () => {
    const sections = createRendererNavSections([
      repository("ungrouped"),
      repository("platform", { group: "Platform" }),
      repository("archived", { archived: true, group: "Platform" }),
    ]);

    expect(sections.map((section) => section.title)).toEqual([
      "Workspace",
      "Repositories",
      "Platform",
      "Archived repositories",
    ]);
    expect(sections[2]?.items.map((item) => item.id)).toContain("repository:platform");
    expect(sections[3]?.items.map((item) => item.id)).toContain("repository:archived");
  });
});
