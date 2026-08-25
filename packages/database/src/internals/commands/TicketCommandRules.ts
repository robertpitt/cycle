import { Effect } from "effect";
import {
  CURRENT_SCHEMA_VERSION,
  normalizeKey,
  stripUndefined,
  updatedDateKey,
  type Actor,
  type CreateTicketDraftInput,
  type IssueRelation,
  type LinkedRecord,
  type TicketDocument,
  type TicketDraftDocument,
  type TicketRevisionMetadataChange,
  type UpdateTicketDraftInput,
} from "../../domain/index.ts";
import { DatabaseValidationError, type DatabaseFailure } from "../../DatabaseErrors.ts";
export const DEFAULT_POINTER = "main";
export const DEFAULT_TICKET_PREFIX = "UKN";
export const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
export const TICKET_ID_PATTERN = /^[A-Z0-9]{2,5}-[0-9A-Z]{5,}$/u;
export const validateTicket = (ticket: TicketDocument): Effect.Effect<void, DatabaseFailure> =>
  Effect.try({
    catch: (cause) =>
      cause instanceof Error
        ? new DatabaseValidationError({ field: "ticket", message: cause.message, cause: cause })
        : new DatabaseValidationError({ field: "ticket", message: "invalid ticket", cause: cause }),
    try: () => validateTicketSync(ticket),
  }).pipe(
    Effect.mapError((error) =>
      error instanceof Error
        ? new DatabaseValidationError({ field: "ticket", message: error.message, cause: error })
        : new DatabaseValidationError({ field: "ticket", message: "invalid ticket", cause: error }),
    ),
  );

export const validateTicketSync = (ticket: TicketDocument): void => {
  validateTicketId("ticket id", ticket.id);
  validateRequiredString("title", ticket.frontmatter.title);
  validateRequiredString("status", ticket.frontmatter.status);
  validateRequiredString("priority", ticket.frontmatter.priority);
  validateRequiredString("type", ticket.frontmatter.type);
  validateRequiredString("createdAt", ticket.frontmatter.createdAt);
  validateRequiredString("updatedAt", ticket.frontmatter.updatedAt);
  validateRequiredString("createdBy.name", ticket.frontmatter.createdBy.name);
};

export const validateTicketId = (field: string, value: string): void => {
  if (!TICKET_ID_PATTERN.test(value)) {
    throw new Error(`${field} must match PREFIX-BASE36 format`);
  }
};

export const validateSafeSegment = (field: string, value: string): void => {
  if (!SAFE_SEGMENT.test(value) || value.endsWith(".lock") || value === "." || value === "..") {
    throw new Error(`${field} must be a safe segment`);
  }
};

export const validateRequiredString = (field: string, value: string): void => {
  if (value.trim().length === 0) throw new Error(`${field} must not be empty`);
};

export const validateSavedViewKind = (value: string): void => {
  if (value !== "board" && value !== "list") throw new Error("view kind is invalid");
};

export const validateSavedViewGroup = (value: string): void => {
  if (!["assignee", "dueDate", "label", "none", "parent", "priority", "status"].includes(value)) {
    throw new Error("view groupBy is invalid");
  }
};

export const validateIssueTemplateKind = (value: string): void => {
  if (
    !["bug", "feature", "implementation", "initiative", "qa", "specification", "story"].includes(
      value,
    )
  ) {
    throw new Error("template kind is invalid");
  }
};

export const assertNoUnsafeContent = (
  field: string,
  value: unknown,
): Effect.Effect<void, DatabaseFailure> => {
  const unsafeKey = findUnsafeKey(value);

  return unsafeKey === null
    ? Effect.void
    : Effect.fail(
        new DatabaseValidationError({
          field: field,
          message: `unsafe secret-bearing field is not allowed: ${unsafeKey}`,
        }),
      );
};

export const findUnsafeKey = (value: unknown, path = ""): string | null => {
  if (value === null || typeof value !== "object") return null;

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findUnsafeKey(value[index], `${path}[${index}]`);

      if (found !== null) return found;
    }

    return null;
  }

  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = path.length === 0 ? key : `${path}.${key}`;

    if (/(api[_-]?key|token|secret|password|private[_-]?key)/iu.test(key)) {
      return nestedPath;
    }

    const found = findUnsafeKey(nested, nestedPath);

    if (found !== null) return found;
  }

  return null;
};

export const maxCommitTitleLength = 72;

export const compactText = (value: string): string => value.replace(/\s+/gu, " ").trim();

export const titleForCommitMessage = (title: string): string => {
  const compact = compactText(title);

  if (compact.length <= maxCommitTitleLength) return compact;

  return `${compact.slice(0, maxCommitTitleLength - 3).trimEnd()}...`;
};

export const quoteCommitTitle = (title: string): string =>
  `"${titleForCommitMessage(title).replaceAll('"', "'")}"`;

export const quotedTicketTitle = (ticket: TicketDocument): string => quoteCommitTitle(ticket.title);

export const humanizeKey = (value: string): string =>
  compactText(value)
    .split(/[-_\s]+/u)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1).toLowerCase()}`)
    .join(" ");

export const createdTicketMessage = (actor: Actor, ticket: TicketDocument): string =>
  `${actor.name} created ${quotedTicketTitle(ticket)} ticket`;

export const updatedTicketMessage = (
  actor: Actor,
  current: TicketDocument,
  next: TicketDocument,
): string => {
  if (next.status !== current.status) {
    return `${actor.name} updated the status of ${quotedTicketTitle(next)} to ${humanizeKey(next.status)}`;
  }

  if (next.title !== current.title) {
    return `${actor.name} renamed ${quotedTicketTitle(current)} ticket to ${quotedTicketTitle(next)}`;
  }

  return `${actor.name} updated ${quotedTicketTitle(next)} ticket`;
};

export const relationMessage = (
  actor: Actor,
  action: "add" | "remove",
  relationType: IssueRelation["type"],
  source: TicketDocument,
  target: TicketDocument,
): string =>
  `${actor.name} ${action === "add" ? "added" : "removed"} ${humanizeKey(
    relationType,
  ).toLowerCase()} relation between ${quotedTicketTitle(source)} and ${quotedTicketTitle(target)}`;

export const recordMessage = (actor: Actor, recordType: string, ticket: TicketDocument): string =>
  normalizeKey(recordType) === "comment"
    ? `${actor.name} commented on ${quotedTicketTitle(ticket)} ticket`
    : `${actor.name} added ${humanizeKey(recordType).toLowerCase()} to ${quotedTicketTitle(
        ticket,
      )} ticket`;

export const draftTitle = (draft: TicketDraftDocument): string =>
  quoteCommitTitle(draft.input.title ?? "Untitled ticket");

export const draftCreatedMessage = (actor: Actor, draft: TicketDraftDocument): string =>
  `${actor.name} drafted ${draftTitle(draft)} ticket`;

export const draftUpdatedMessage = (actor: Actor, draft: TicketDraftDocument): string =>
  `${actor.name} updated draft for ${draftTitle(draft)} ticket`;

export const makeRecord = (
  input: {
    readonly payload: unknown;
    readonly recordType: string;
    readonly ticketId: string;
  },
  id: string,
  actor: Actor,
  now: string,
): LinkedRecord => ({
  createdAt: now,
  createdBy: actor,
  createdDate: updatedDateKey(now),
  id,
  issueId: input.ticketId,
  payload: input.payload,
  recordType: normalizeKey(input.recordType),
  schemaVersion: CURRENT_SCHEMA_VERSION,
});

export const initialProvenanceRecord = (
  ticketId: string,
  id: string,
  actor: Actor,
  now: string,
): LinkedRecord =>
  makeRecord(
    {
      payload: {
        actor,
        timestamp: now,
      },
      recordType: "provenance",
      ticketId,
    },
    id,
    actor,
    now,
  );

export const statusChangeRecord = (
  ticketId: string,
  id: string,
  actor: Actor,
  now: string,
  from: string | null,
  to: string,
  reason?: string,
): LinkedRecord =>
  makeRecord(
    {
      payload: stripUndefined({
        from,
        reason,
        to,
      }),
      recordType: "status-change",
      ticketId,
    },
    id,
    actor,
    now,
  );

export const issueRelationTypes = new Set([
  "depends_on",
  "blocks",
  "related",
  "blocked-by",
  "blocking",
  "duplicate",
]);

export const isIssueRelationType = (value: string): value is IssueRelation["type"] =>
  issueRelationTypes.has(value);

export const inverseRelation = (relation: IssueRelation, issueId: string): IssueRelation => ({
  issueId,
  type:
    relation.type === "blocks"
      ? "depends_on"
      : relation.type === "depends_on"
        ? "blocks"
        : relation.type === "blocking"
          ? "blocked-by"
          : relation.type === "blocked-by"
            ? "blocking"
            : relation.type,
});

export const relationKey = (relation: IssueRelation): string =>
  `${relation.type}:${relation.issueId}`;

export const addRelation = (
  current: ReadonlyArray<IssueRelation> | undefined,
  relation: IssueRelation,
): ReadonlyArray<IssueRelation> => {
  const relations = new Map((current ?? []).map((entry) => [relationKey(entry), entry]));

  relations.set(relationKey(relation), relation);

  return [...relations.values()].sort((a, b) => relationKey(a).localeCompare(relationKey(b)));
};

export const removeRelation = (
  current: ReadonlyArray<IssueRelation> | undefined,
  relation: IssueRelation,
): ReadonlyArray<IssueRelation> | undefined => {
  const next = (current ?? []).filter((entry) => relationKey(entry) !== relationKey(relation));

  return next.length === 0 ? undefined : next;
};

export const commentPayloadBody = (payload: unknown): string => {
  if (typeof payload === "string") return payload;
  if (payload !== null && typeof payload === "object") {
    const record = payload as Readonly<Record<string, unknown>>;

    if (typeof record.body === "string") return record.body;
    if (typeof record.text === "string") return record.text;
    if (typeof record.markdown === "string") return record.markdown;
    if (typeof record.comment === "string") return record.comment;
  }

  return "";
};

export const metadataFields = [
  "title",
  "status",
  "priority",
  "project",
  "assignee",
  "labels",
  "parent",
  "children",
  "dueDate",
  "estimate",
  "archivedAt",
  "deletedAt",
  "duplicateOf",
  "relations",
] as const;

export const metadataChanges = (
  before: TicketDocument | null,
  after: TicketDocument | null,
): ReadonlyArray<TicketRevisionMetadataChange> => {
  const changes: Array<TicketRevisionMetadataChange> = [];

  for (const field of metadataFields) {
    const beforeValue = before?.frontmatter[field] ?? null;
    const afterValue = after?.frontmatter[field] ?? null;

    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      changes.push({
        after: afterValue,
        before: beforeValue,
        field,
      });
    }
  }

  return changes;
};

export const mergeDraftInput = (
  current: CreateTicketDraftInput,
  patch: UpdateTicketDraftInput,
): CreateTicketDraftInput => {
  const frontmatter = patch.frontmatter ?? {};

  return stripUndefined({
    ...current,
    assignee: frontmatter["assignee"] ?? current.assignee,
    body: patch.body ?? current.body,
    dueDate: frontmatter["dueDate"] ?? current.dueDate,
    estimate: frontmatter["estimate"] ?? current.estimate,
    externalLinks: frontmatter["externalLinks"] ?? current.externalLinks,
    labels: frontmatter["labels"] ?? current.labels,
    parent: frontmatter["parent"] ?? current.parent,
    planningNotRequired: frontmatter["planningNotRequired"] ?? current.planningNotRequired,
    project: frontmatter["project"] ?? current.project,
    priority: frontmatter["priority"] ?? current.priority,
    repository: frontmatter["repository"] ?? current.repository,
    source: frontmatter["source"] ?? current.source,
    status: patch.status ?? frontmatter["status"] ?? current.status,
    title: frontmatter["title"] ?? current.title,
    type: frontmatter["type"] ?? current.type,
  }) as CreateTicketDraftInput;
};
