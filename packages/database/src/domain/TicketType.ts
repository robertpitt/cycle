export type CanonicalTicketTypeId = "bug" | "epic" | "feature" | "task";

export type TicketTypeDefinition = {
  readonly id: CanonicalTicketTypeId;
  readonly label: string;
  readonly branchSegment: string;
};

export type TicketTypeMaterialization = {
  readonly branchSegment: string;
  readonly canonicalType: CanonicalTicketTypeId;
  readonly explicit: boolean;
  readonly originalType?: string;
  readonly type: string;
  readonly warning?: string;
};

export const canonicalTicketTypes: readonly TicketTypeDefinition[] = [
  { branchSegment: "epic", id: "epic", label: "Epic" },
  { branchSegment: "feature", id: "feature", label: "Feature" },
  { branchSegment: "bug", id: "bug", label: "Bug" },
  { branchSegment: "task", id: "task", label: "Task" },
];

export const canonicalTicketTypeIds: readonly CanonicalTicketTypeId[] = canonicalTicketTypes.map(
  (type) => type.id,
);

const canonicalById = new Map(canonicalTicketTypes.map((type) => [type.id, type]));
const legacyAliases = new Map<string, CanonicalTicketTypeId>([
  ["initiative", "epic"],
  ["issue", "task"],
]);

export const normalizeTicketTypeId = (value: unknown): string => {
  if (value === null || value === undefined) return "";

  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^[._-]+/u, "")
    .replace(/[._-]+$/u, "");
};

export const ticketTypeDefinition = (id: string): TicketTypeDefinition | undefined =>
  canonicalById.get(id as CanonicalTicketTypeId);

export const isCanonicalTicketType = (value: unknown): value is CanonicalTicketTypeId =>
  canonicalById.has(normalizeTicketTypeId(value) as CanonicalTicketTypeId);

export const validateNewTicketType = (
  value: unknown,
):
  | { readonly ok: true; readonly type: CanonicalTicketTypeId }
  | { readonly ok: false; readonly reason: string } => {
  const normalized = normalizeTicketTypeId(value);

  if (normalized.length === 0) {
    return { ok: false, reason: "ticket type is required" };
  }

  if (!canonicalById.has(normalized as CanonicalTicketTypeId)) {
    return {
      ok: false,
      reason: `unknown ticket type: ${String(value)}`,
    };
  }

  return { ok: true, type: normalized as CanonicalTicketTypeId };
};

export const materializeTicketType = (value: unknown): TicketTypeMaterialization => {
  const normalized = normalizeTicketTypeId(value);

  if (canonicalById.has(normalized as CanonicalTicketTypeId)) {
    const type = normalized as CanonicalTicketTypeId;
    return {
      branchSegment: canonicalById.get(type)?.branchSegment ?? "task",
      canonicalType: type,
      explicit: true,
      type,
    };
  }

  const alias = legacyAliases.get(normalized);
  if (alias !== undefined) {
    return {
      branchSegment: canonicalById.get(alias)?.branchSegment ?? "task",
      canonicalType: alias,
      explicit: false,
      originalType: normalized,
      type: alias,
      warning: `legacy ticket type "${normalized}" materialized as "${alias}"`,
    };
  }

  if (normalized.length === 0) {
    return {
      branchSegment: "task",
      canonicalType: "task",
      explicit: false,
      type: "task",
      warning: 'missing legacy ticket type materialized as "task"',
    };
  }

  return {
    branchSegment: "task",
    canonicalType: "task",
    explicit: false,
    originalType: normalized,
    type: normalized,
    warning: `unknown legacy ticket type "${normalized}" preserved for read compatibility`,
  };
};

export const ticketTypeBranchSegment = (value: unknown): string =>
  materializeTicketType(value).branchSegment;
