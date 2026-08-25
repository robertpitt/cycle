import type { TicketDocument } from "@cycle/contracts/schemas";

export type TicketPromptWorkflowIntent = "improve" | "split" | "follow_up" | "plan";

export type TicketPromptWorkflowInput = {
  readonly intent: TicketPromptWorkflowIntent;
  readonly issue: Pick<TicketDocument, "body" | "id" | "repositoryId" | "type"> & {
    readonly frontmatter: Pick<
      TicketDocument["frontmatter"],
      "assignee" | "labels" | "priority" | "status" | "title"
    >;
  };
  readonly repositoryName: string;
};

const workflowInstructions = {
  improve: [
    "Improve this ticket in place.",
    "Identify ambiguity, missing acceptance criteria, risky assumptions, and useful implementation detail.",
    "Present a proposed replacement title and Markdown body before making any change.",
    "Only update the ticket after the user confirms the proposal.",
  ],
  split: [
    "Split this ticket into the smallest coherent set of independently deliverable tickets.",
    "Explain the split, dependencies, and recommended order.",
    "Present proposed ticket titles and bodies before creating anything.",
    "Only create tickets after the user confirms the proposal.",
  ],
  follow_up: [
    "Create a focused follow-up ticket from this ticket's remaining or adjacent work.",
    "Ask which outcome to pursue if the intended follow-up is ambiguous.",
    "Present the proposed title, body, relationship, labels, and priority before creating it.",
    "Only create the follow-up after the user confirms the proposal.",
  ],
  plan: [
    "Produce an implementation plan for this ticket.",
    "Inspect the repository when useful and ground the plan in actual modules, contracts, tests, and risks.",
    "Do not modify code or ticket data unless the user explicitly asks you to proceed.",
  ],
} satisfies Record<TicketPromptWorkflowIntent, readonly string[]>;

const valueOrNone = (value: string | null | undefined): string => value?.trim() || "none";

export const ticketPromptWorkflowTitle = (intent: TicketPromptWorkflowIntent): string =>
  ({
    follow_up: "Create follow-up ticket",
    improve: "Improve ticket",
    plan: "Plan ticket",
    split: "Split ticket",
  })[intent];

export const assembleTicketPromptWorkflow = ({
  intent,
  issue,
  repositoryName,
}: TicketPromptWorkflowInput): string =>
  [
    `Workflow: ticket.${intent}`,
    `Repository: ${repositoryName} (cycle://repository/${issue.repositoryId})`,
    `Ticket: ${issue.id} (cycle://repository/${issue.repositoryId}/issue/${issue.id})`,
    "",
    ...workflowInstructions[intent].map((instruction) => `- ${instruction}`),
    "",
    "Current ticket context:",
    `- Type: ${issue.type}`,
    `- Title: ${issue.frontmatter.title}`,
    `- Status: ${issue.frontmatter.status}`,
    `- Priority: ${issue.frontmatter.priority}`,
    `- Assignee: ${valueOrNone(issue.frontmatter.assignee)}`,
    `- Labels: ${(issue.frontmatter.labels ?? []).join(", ") || "none"}`,
    "",
    "Current Markdown body:",
    issue.body.trim() || "(empty)",
  ].join("\n");
