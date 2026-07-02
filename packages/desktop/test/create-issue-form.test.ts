import { strict as assert } from "node:assert";
import { describe, it } from "vitest";
import { getCreateIssueRepositorySelectionPatch } from "../src/renderer/screens/workspace/createIssueForm.ts";

describe("create issue form", () => {
  it("clears repository-scoped selections when switching repositories", () => {
    assert.deepEqual(getCreateIssueRepositorySelectionPatch("repo-b"), {
      assignee: null,
      labels: [],
      project: null,
      repositoryId: "repo-b",
      template: null,
    });
  });
});
