export type TicketTypeId = "bug" | "epic" | "feature" | "task";

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
    description: "Incorrect behavior or regression",
    id: "bug",
    label: "Bug",
  },
  {
    description: "Implementation or maintenance work",
    id: "task",
    label: "Task",
  },
] as const satisfies ReadonlyArray<{
  readonly description: string;
  readonly id: TicketTypeId;
  readonly label: string;
}>;

export const isCanonicalTicketType = (value: string | undefined): value is TicketTypeId =>
  value === "bug" || value === "epic" || value === "feature" || value === "task";

export const normalizeCreateTicketType = (value: string | undefined): TicketTypeId | undefined => {
  if (isCanonicalTicketType(value)) return value;
  if (value === "initiative") return "epic";
  if (value === "issue") return "task";
  return undefined;
};
