import { Schema } from "effect";

export const CanonicalTicketTypeIds = [
  "epic",
  "feature",
  "story",
  "bug",
  "task",
  "specification",
] as const;

export type TicketTypeId = (typeof CanonicalTicketTypeIds)[number];

export type TicketTypeDefinition = {
  readonly id: TicketTypeId;
  readonly displayLabel: string;
  readonly branchSegment: string;
};

export const TicketTypeId = Schema.Literals([
  "epic",
  "feature",
  "story",
  "bug",
  "task",
  "specification",
]).pipe(
  Schema.annotate({
    description:
      "Canonical ticket type accepted for writes. Legacy aliases are normalized only on reads.",
    identifier: "@cycle/contracts/TicketTypeId",
    title: "TicketTypeId",
  }),
);

export const TicketTypeRegistry = {
  bug: { branchSegment: "bug", displayLabel: "Bug", id: "bug" },
  epic: { branchSegment: "epic", displayLabel: "Epic", id: "epic" },
  feature: { branchSegment: "feature", displayLabel: "Feature", id: "feature" },
  specification: {
    branchSegment: "specification",
    displayLabel: "Specification",
    id: "specification",
  },
  story: { branchSegment: "story", displayLabel: "Story", id: "story" },
  task: { branchSegment: "task", displayLabel: "Task", id: "task" },
} as const satisfies Readonly<Record<TicketTypeId, TicketTypeDefinition>>;

export const LegacyTicketTypeAliases = {
  initiative: "epic",
  issue: "task",
} as const satisfies Readonly<Record<string, TicketTypeId>>;

export type TicketTypeReadDiagnosticCode =
  | "LEGACY_TICKET_TYPE_ALIAS"
  | "MISSING_TICKET_TYPE_FALLBACK";

export type TicketTypeReadDiagnostic = {
  readonly code: TicketTypeReadDiagnosticCode;
  readonly message: string;
  readonly normalizedType: string;
  readonly originalType?: string;
};

export type NormalizedTicketTypeForRead = {
  readonly diagnostic?: TicketTypeReadDiagnostic;
  readonly type: string;
};

export type TicketTypeWriteValidation =
  | { readonly type: "valid"; readonly value: TicketTypeId }
  | {
      readonly type: "invalid";
      readonly reason: "display-label" | "empty" | "missing" | "unknown";
      readonly value?: string;
    };

export const isCanonicalTicketTypeId = (value: string): value is TicketTypeId =>
  Object.hasOwn(TicketTypeRegistry, value);

export const normalizeTicketTypeForRead = (value: unknown): NormalizedTicketTypeForRead => {
  if (typeof value !== "string" || value.trim() === "") {
    return {
      diagnostic: {
        code: "MISSING_TICKET_TYPE_FALLBACK",
        message: "Ticket is missing a type; using legacy fallback task.",
        normalizedType: "task",
      },
      type: "task",
    };
  }

  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase();
  const alias = (LegacyTicketTypeAliases as Readonly<Record<string, TicketTypeId>>)[normalized];
  if (alias !== undefined) {
    return {
      diagnostic: {
        code: "LEGACY_TICKET_TYPE_ALIAS",
        message: `Legacy ticket type ${value} is readable as ${alias}.`,
        normalizedType: alias,
        originalType: value,
      },
      type: alias,
    };
  }

  return { type: isCanonicalTicketTypeId(normalized) ? normalized : trimmed };
};

export const validateTicketTypeForWrite = (value: unknown): TicketTypeWriteValidation => {
  if (value === undefined || value === null) return { reason: "missing", type: "invalid" };
  if (typeof value !== "string") return { reason: "unknown", type: "invalid" };

  const trimmed = value.trim();
  if (trimmed === "") return { reason: "empty", type: "invalid", value };
  if (isCanonicalTicketTypeId(trimmed)) return { type: "valid", value: trimmed };

  const displayLabel = Object.values(TicketTypeRegistry).some(
    (definition) => definition.displayLabel === trimmed,
  );
  return { reason: displayLabel ? "display-label" : "unknown", value, type: "invalid" };
};
