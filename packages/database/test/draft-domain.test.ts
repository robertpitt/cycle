import { strict as assert } from "node:assert";
import { describe, it } from "vitest";
import { makeFrontmatter, makeTicketDocument } from "../src/domain/TicketDocument.ts";
import { mergeDraftInput } from "../src/internals/DatabaseHelpers.ts";

const actor = { name: "Test User", type: "human" as const };

describe("ticket project and draft domain fields", () => {
  it("persists project membership into issue frontmatter and public documents", () => {
    const frontmatter = makeFrontmatter(
      {
        project: "project-alpha",
        title: "Project ticket",
        type: "task",
      },
      "CYC-1",
      actor,
      "2026-08-25T10:00:00.000Z",
    );
    const ticket = makeTicketDocument(frontmatter, "Ticket body");

    assert.equal(frontmatter.project, "project-alpha");
    assert.equal(ticket.project, "project-alpha");
  });

  it("applies project and source changes when a durable draft is updated", () => {
    const updated = mergeDraftInput(
      {
        project: "project-alpha",
        source: { kind: "desktop-agent-draft" },
        title: "Draft ticket",
        type: "task",
      },
      {
        frontmatter: {
          project: "project-beta",
          source: { kind: "agent-refined-draft" },
        },
      },
    );

    assert.equal(updated.project, "project-beta");
    assert.deepEqual(updated.source, { kind: "agent-refined-draft" });
  });
});
