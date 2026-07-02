export type TicketTypeId = "bug" | "epic" | "feature" | "specification" | "story" | "task";

export type TicketTypeSelectionId = "auto" | TicketTypeId;

export const authoringTicketTypes = [
  {
    description: "Let the agent choose; manual create defaults to task",
    id: "auto",
    label: "Auto",
  },
  {
    description: "Large outcome or parent workstream",
    id: "epic",
    label: "Epic",
  },
  {
    description: "New user-facing capability",
    id: "feature",
    label: "Feature",
  },
  {
    description: "User workflow or product behavior slice",
    id: "story",
    label: "Story",
  },
  {
    description: "Incorrect behavior or regression",
    id: "bug",
    label: "Bug",
  },
  {
    description: "Implementation or maintenance work",
    id: "task",
    label: "Task",
  },
  {
    description: "Requirements, contracts, or implementation spec",
    id: "specification",
    label: "Specification",
  },
] as const satisfies ReadonlyArray<{
  readonly description: string;
  readonly id: TicketTypeSelectionId;
  readonly label: string;
}>;

export const canonicalTicketTypes = [
  {
    description: "Large outcome or parent workstream",
    id: "epic",
    label: "Epic",
  },
  {
    description: "New user-facing capability",
    id: "feature",
    label: "Feature",
  },
  {
    description: "User workflow or product behavior slice",
    id: "story",
    label: "Story",
  },
  {
    description: "Incorrect behavior or regression",
    id: "bug",
    label: "Bug",
  },
  {
    description: "Implementation or maintenance work",
    id: "task",
    label: "Task",
  },
  {
    description: "Requirements, contracts, or implementation spec",
    id: "specification",
    label: "Specification",
  },
] as const satisfies ReadonlyArray<{
  readonly description: string;
  readonly id: TicketTypeId;
  readonly label: string;
}>;

export const isCanonicalTicketType = (value: string | undefined): value is TicketTypeId =>
  value === "bug" ||
  value === "epic" ||
  value === "feature" ||
  value === "specification" ||
  value === "story" ||
  value === "task";

export const isTicketTypeSelection = (value: string | undefined): value is TicketTypeSelectionId =>
  value === "auto" || isCanonicalTicketType(value);

export const normalizeCreateTicketType = (value: string | undefined): TicketTypeId | undefined => {
  if (isCanonicalTicketType(value)) return value;
  if (value === "initiative") return "epic";
  if (value === "issue") return "task";
  return undefined;
};

export const resolveManualTicketType = (value: TicketTypeSelectionId | ""): TicketTypeId =>
  isCanonicalTicketType(value) ? value : "task";
