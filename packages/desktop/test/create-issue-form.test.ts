import { strict as assert } from "node:assert";
import { describe, it } from "vitest";
import {
  createDraftUpdateInput,
  createIssueFormPatchFromDraft,
  getAgentCreateDraftInput,
  getCreateIssueRepositorySelectionPatch,
  getManualCreateDraftInput,
  type CreateIssueFormValues,
} from "../src/renderer/screens/workspace/createIssueForm.ts";

const values = (patch: Partial<CreateIssueFormValues> = {}): CreateIssueFormValues => ({
  assignee: "user-a",
  createMore: false,
  description: "Existing description",
  draftInstructions: "Create a clear project ticket",
  dueDate: "2026-09-15",
  error: undefined,
  estimate: "5",
  externalLinks: [{ title: "Brief", url: "https://example.com/brief" }],
  labels: ["product"],
  mode: "manual",
  parent: "CYC-1",
  priority: "high",
  project: "project-alpha",
  repositoryId: "repo-a",
  status: "todo",
  template: "template-feature",
  title: "Project ticket",
  type: "feature",
  ...patch,
});

describe("create issue form", () => {
  it("clears repository-scoped selections when switching repositories", () => {
    assert.deepEqual(getCreateIssueRepositorySelectionPatch("repo-b"), {
      assignee: null,
      externalLinks: [],
      labels: [],
      parent: null,
      project: null,
      repositoryId: "repo-b",
      template: null,
    });
  });

  it("preserves the selected project and fields in manual durable drafts", () => {
    const draft = getManualCreateDraftInput(values());

    assert.equal(draft?.project, "project-alpha");
    assert.equal(draft?.repository, "repo-a");
    assert.deepEqual(draft?.labels, ["product"]);
    assert.deepEqual(draft?.source, {
      kind: "desktop-manual-draft",
      templateId: "template-feature",
    });
  });

  it("seeds agent creation with every selected authoring field", () => {
    const draft = getAgentCreateDraftInput(values({ mode: "agent", type: "auto" }));

    assert.deepEqual(draft, {
      assignee: "user-a",
      body: "Create a clear project ticket",
      dueDate: "2026-09-15",
      estimate: "5",
      externalLinks: [{ title: "Brief", url: "https://example.com/brief" }],
      labels: ["product"],
      parent: "CYC-1",
      priority: "high",
      project: "project-alpha",
      repository: "repo-a",
      source: {
        authoringType: "auto",
        instructions: "Create a clear project ticket",
        kind: "desktop-agent-draft",
        templateId: "template-feature",
      },
      status: "todo",
      title: "Create a clear project ticket",
      type: "task",
    });
  });

  it("recovers durable drafts into the editable manual form and builds update payloads", () => {
    const input = getAgentCreateDraftInput(values({ mode: "agent" }));
    const draft = {
      createdAt: "2026-08-25T10:00:00.000Z",
      createdBy: { name: "Test", type: "human" as const },
      id: "draft-1",
      input,
      schemaVersion: 1 as const,
      status: "open" as const,
      updatedAt: "2026-08-25T10:01:00.000Z",
    };

    assert.deepEqual(createIssueFormPatchFromDraft(draft), {
      assignee: "user-a",
      description: "Create a clear project ticket",
      draftInstructions: "Create a clear project ticket",
      dueDate: "2026-09-15",
      estimate: "5",
      externalLinks: [{ title: "Brief", url: "https://example.com/brief" }],
      labels: ["product"],
      mode: "manual",
      parent: "CYC-1",
      priority: "high",
      project: "project-alpha",
      status: "todo",
      template: "template-feature",
      title: "Create a clear project ticket",
      type: "feature",
    });
    assert.equal(createDraftUpdateInput(draft.id, input).draftId, "draft-1");
    assert.equal(createDraftUpdateInput(draft.id, input).frontmatter?.project, "project-alpha");
  });
});
