import { describe, expect, it } from "vitest";
import {
  assembleTicketPromptWorkflow,
  ticketPromptWorkflowTitle,
  type TicketPromptWorkflowIntent,
} from "../src/renderer/lib/ticketPromptWorkflows.ts";

const intents: readonly TicketPromptWorkflowIntent[] = ["improve", "split", "follow_up", "plan"];

describe("ticket prompt workflows", () => {
  it.each(intents)("assembles ticket.%s with stable ticket context", (intent) => {
    const prompt = assembleTicketPromptWorkflow({
      intent,
      issue: {
        body: "Ship the feature.",
        frontmatter: {
          assignee: "user-1",
          labels: ["product"],
          priority: "high",
          status: "todo",
          title: "Product workflow",
        },
        id: "CYC-42",
        repositoryId: "cycle-local",
        type: "task",
      },
      repositoryName: "Cycle",
    });

    expect(prompt).toContain(`Workflow: ticket.${intent}`);
    expect(prompt).toContain("Ticket: CYC-42");
    expect(prompt).toContain("Title: Product workflow");
    expect(prompt).toContain("Ship the feature.");
    expect(ticketPromptWorkflowTitle(intent).length).toBeGreaterThan(0);
  });
});
