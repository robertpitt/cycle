import { strict as assert } from "node:assert";
import type { TicketDocument } from "@cycle/contracts/schemas";
import { describe, it } from "vitest";
import { mapTicketDependencies } from "../src/renderer/lib/ticketDependencies.ts";

const ticket = (
  id: string,
  status: string,
  relations: TicketDocument["frontmatter"]["relations"] = [],
): TicketDocument =>
  ({
    body: "",
    bodyFormat: "markdown",
    createdBy: "test",
    frontmatter: {
      createdAt: "2026-01-01T00:00:00.000Z",
      createdBy: { name: "Test", type: "human" },
      id,
      priority: "none",
      relations,
      status,
      title: `Ticket ${id}`,
      type: "task",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    id,
    parent: "",
    priority: "none",
    schemaVersion: 1,
    status,
    title: `Ticket ${id}`,
    type: "task",
    updatedDate: "2026-01-01",
  }) as TicketDocument;

describe("ticket dependency renderer mapping", () => {
  it("maps unfinished blockers, downstream tickets, and completed prerequisites", () => {
    const current = ticket("CYC-1", "todo", [
      { issueId: "CYC-2", type: "depends_on" },
      { issueId: "CYC-3", type: "depends_on" },
      { issueId: "CYC-4", type: "blocks" },
    ]);
    const state = mapTicketDependencies(current, [
      ticket("CYC-2", "in-progress"),
      ticket("CYC-3", "done"),
      ticket("CYC-4", "todo"),
    ]);

    assert.equal(state.blocked, true);
    assert.deepEqual(
      state.blockingTickets.map((entry) => entry.id),
      ["CYC-2"],
    );
    assert.deepEqual(
      state.downstreamBlockedTickets.map((entry) => entry.id),
      ["CYC-4"],
    );
    assert.match(state.warnings[0] ?? "", /unfinished prerequisite/u);
  });

  it("surfaces missing targets and circular dependency warnings", () => {
    const current = ticket("CYC-1", "todo", [
      { issueId: "CYC-2", type: "depends_on" },
      { issueId: "CYC-404", type: "blocks" },
    ]);
    const prerequisite = ticket("CYC-2", "todo", [{ issueId: "CYC-1", type: "depends_on" }]);
    const state = mapTicketDependencies(current, [prerequisite]);

    assert.equal(state.blocked, true);
    assert.equal(
      state.warnings.some((warning) => warning.includes("CYC-404")),
      true,
    );
    assert.equal(state.warnings.includes("Circular dependency detected."), true);
  });

  it("warns about a missing downstream ticket without blocking the current ticket", () => {
    const current = ticket("CYC-1", "todo", [{ issueId: "CYC-404", type: "blocks" }]);
    const state = mapTicketDependencies(current, []);

    assert.equal(state.blocked, false);
    assert.equal(
      state.warnings.some((warning) => warning.includes("CYC-404")),
      true,
    );
  });
});
