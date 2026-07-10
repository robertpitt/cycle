import { Effect } from "effect";
import type { DatabaseIdGeneratorShape } from "../DatabaseIdGenerator.ts";
import {
  CURRENT_SCHEMA_VERSION,
  normalizeKey,
  stripUndefined,
  updatedDateKey,
  type Actor,
  type CreateTicketDraftInput,
  type CycleRepositoryMetadata,
  type IssueRelation,
  type IssueTemplateDocument,
  type LabelDefinitionDocument,
  type LinkedRecord,
  type MaterializationWarning,
  type SavedViewDocument,
  type TicketDocument,
  type TicketDraftDocument,
  type TicketQuery,
  type TicketRevisionMetadataChange,
  type UpdateTicketDraftInput,
  type UserProfileDocument,
} from "../domain/index.ts";
import {
  DatabaseSqliteError,
  DatabaseStorageError,
  DatabaseValidationError,
  type DatabaseFailure,
} from "../DatabaseErrors.ts";

export const DEFAULT_POINTER = "main";
export const DEFAULT_TICKET_PREFIX = "UKN";
export const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
export const TICKET_ID_PATTERN = /^[A-Z0-9]{2,5}-[0-9A-Z]{5,}$/u;

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const isRemotePushRejection = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;

  const record = error as {
    readonly _tag?: unknown;
    readonly message?: unknown;
    readonly stderr?: unknown;
  };

  if (record._tag !== "RemotePushError" && record._tag !== "GitRemoteError") return false;

  const text = `${String(record.message ?? "")}\n${String(record.stderr ?? "")}`;

  return /fetch first|non-fast-forward|remote contains work|stale info|updates were rejected/iu.test(
    text,
  );
};

export const DEFAULT_PROJECTION_PATH = ":memory:";

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
    priority: frontmatter["priority"] ?? current.priority,
    repository: frontmatter["repository"] ?? current.repository,
    status: patch.status ?? frontmatter["status"] ?? current.status,
    title: frontmatter["title"] ?? current.title,
    type: frontmatter["type"] ?? current.type,
  }) as CreateTicketDraftInput;
};

export const defaultRepositoryMetadata = (
  actor: Actor,
  now: string,
  actorUserId: string | undefined,
): {
  readonly labels: ReadonlyArray<LabelDefinitionDocument>;
  readonly templates: ReadonlyArray<IssueTemplateDocument>;
  readonly views: ReadonlyArray<SavedViewDocument>;
} => {
  const label = (
    id: string,
    name: string,
    color: string,
    description: string,
  ): LabelDefinitionDocument => ({
    color,
    createdAt: now,
    createdBy: actor,
    description,
    id,
    name,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: now,
  });
  const view = (
    id: string,
    name: string,
    query: TicketQuery,
    groupBy: SavedViewDocument["groupBy"] = "status",
  ): SavedViewDocument => ({
    builtIn: true,
    createdAt: now,
    createdBy: actor,
    groupBy,
    id,
    kind: "list",
    name,
    pinned: true,
    query,
    repositoryScope: "current-repository",
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sort: {
      direction: "desc",
      field: "updatedAt",
    },
    updatedAt: now,
  });
  const template = (
    id: string,
    name: string,
    kind: IssueTemplateDocument["kind"],
    titleTemplate: string,
    bodyTemplate: string,
    defaults: IssueTemplateDocument["defaults"] = {},
  ): IssueTemplateDocument => ({
    active: true,
    bodyTemplate,
    createdAt: now,
    createdBy: actor,
    defaults,
    id,
    kind,
    name,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    titleTemplate,
    updatedAt: now,
  });

  return {
    labels: [
      label("bug", "Bug", "red", "Defects, regressions, and broken expected behavior."),
      label("feature", "Feature", "blue", "New user-facing capability or product workflow."),
      label("improvement", "Improvement", "green", "Incremental refinement to existing behavior."),
      label("qa", "QA", "amber", "Validation, test coverage, and release confidence work."),
    ],
    templates: [
      template(
        "bug",
        "Bug report",
        "bug",
        "{{title}}",
        "## Expected\n\n## Actual\n\n## Steps to reproduce\n\n## Environment\n",
        {
          labels: ["bug"],
          priority: "high",
          type: "bug",
        },
      ),
      template(
        "feature",
        "Feature",
        "feature",
        "{{title}}",
        "## Context\n\n## Outcome\n\n## Acceptance criteria\n\n## Risks\n",
        {
          labels: ["feature"],
          priority: "medium",
          type: "feature",
        },
      ),
      template(
        "implementation",
        "Implementation task",
        "implementation",
        "{{title}}",
        "## Scope\n\n## Plan\n\n## Verification\n",
        {
          labels: ["improvement"],
          priority: "medium",
          type: "task",
        },
      ),
      template("qa", "QA task", "qa", "{{title}}", "## Test focus\n\n## Scenarios\n\n## Notes\n", {
        labels: ["qa"],
        priority: "medium",
        type: "task",
      }),
      template(
        "initiative",
        "Initiative",
        "initiative",
        "{{title}}",
        "## Outcome\n\n## Scope\n\n## Progress updates\n",
        {
          priority: "medium",
          type: "epic",
        },
      ),
    ],
    views: [
      view("triage", "Triage", {
        hasAssignee: false,
        statusIn: ["backlog", "todo"],
      }),
      view("open-bugs", "Open bugs", {
        labelIn: ["bug"],
        statusIn: ["backlog", "todo", "in-progress"],
      }),
      ...(actorUserId === undefined
        ? []
        : [
            view(
              "assigned-to-me",
              "Assigned to me",
              {
                assigneeIn: [actorUserId],
                statusIn: ["backlog", "todo", "in-progress"],
              },
              "priority",
            ),
          ]),
      view(
        "review-queue",
        "Review queue",
        {
          statusIn: ["in-progress"],
        },
        "assignee",
      ),
      view(
        "stale-backlog",
        "Stale backlog",
        {
          statusIn: ["backlog"],
        },
        "priority",
      ),
      view("blocked-work", "Blocked work", {
        blocked: true,
      }),
    ],
  };
};

export const normalizeUserId = (email: string): string => {
  const normalized = email.trim().toLowerCase();

  if (!/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/u.test(normalized)) {
    throw new Error("user email must be a valid email address");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._@+-]*$/u.test(normalized)) {
    throw new Error("user email contains unsupported document id characters");
  }
  if (
    normalized.includes("/") ||
    normalized.includes("\\") ||
    normalized === "." ||
    normalized === ".." ||
    normalized.endsWith(".lock")
  ) {
    throw new Error("user email is not safe for a document id");
  }

  return normalized;
};

export const normalizeUserIdEffect = (email: string): Effect.Effect<string, DatabaseFailure> =>
  Effect.try({
    catch: (cause) =>
      cause instanceof Error
        ? new DatabaseValidationError({ field: "user.email", message: cause.message, cause: cause })
        : new DatabaseValidationError({
            field: "user.email",
            message: "invalid user email",
            cause: cause,
          }),
    try: () => normalizeUserId(email),
  });

export const makeCycleRepositoryMetadata = (
  prefix: string,
  now: string,
): CycleRepositoryMetadata => ({
  createdAt: now,
  schemaVersion: CURRENT_SCHEMA_VERSION,
  ticketIdFormat: "prefix-base36-5+",
  ticketPrefix: normalizeTicketPrefix(prefix),
  updatedAt: now,
});

export const parseCycleRepositoryMetadata = (
  input: unknown,
  now: string,
): CycleRepositoryMetadata => {
  if (input === null || typeof input !== "object") {
    throw new Error("repository metadata must be an object");
  }

  const value = input as Partial<CycleRepositoryMetadata>;

  if (value.schemaVersion !== undefined && value.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error("repository metadata schema version is unsupported");
  }
  if (value.ticketIdFormat !== undefined && value.ticketIdFormat !== "prefix-base36-5+") {
    throw new Error("repository metadata ticket id format is unsupported");
  }

  return {
    createdAt: typeof value.createdAt === "string" ? value.createdAt : now,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    ticketIdFormat: "prefix-base36-5+",
    ticketPrefix: normalizeTicketPrefix(value.ticketPrefix),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : now,
  };
};

export const normalizeTicketPrefix = (value: unknown): string => {
  const raw = value === null || value === undefined ? DEFAULT_TICKET_PREFIX : String(value);
  const normalized = raw.trim().toUpperCase();

  if (!/^[A-Z0-9]{2,5}$/u.test(normalized)) {
    throw new Error("ticket prefix must be 2-5 uppercase alphanumeric characters");
  }

  return normalized;
};

export const normalizeTicketSeedEffect = (value: string): Effect.Effect<string, DatabaseFailure> =>
  Effect.try({
    catch: (cause) =>
      cause instanceof Error
        ? new DatabaseValidationError({ field: "ticket.id", message: cause.message, cause: cause })
        : new DatabaseValidationError({
            field: "ticket.id",
            message: "invalid ticket id seed",
            cause: cause,
          }),
    try: () => {
      const normalized = value
        .trim()
        .toUpperCase()
        .replace(/[^0-9A-Z]+/gu, "");

      if (normalized.length === 0) throw new Error("ticket id seed must not be empty");

      return normalized.padStart(5, "0");
    },
  });

export const parseUserProfile = (input: unknown): UserProfileDocument => {
  if (input === null || typeof input !== "object") throw new Error("user must be an object");

  const value = input as Partial<UserProfileDocument>;

  if (
    typeof value.id !== "string" ||
    typeof value.email !== "string" ||
    typeof value.displayName !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    throw new Error("user is missing required fields");
  }

  const id = normalizeUserId(value.id);
  const email = normalizeUserId(value.email);

  if (id !== email) throw new Error("user id must match normalized email");
  validateRequiredString("displayName", value.displayName);

  return stripUndefined({
    aliases: value.aliases,
    avatarUrl: value.avatarUrl,
    createdAt: value.createdAt,
    disabledAt: value.disabledAt,
    displayName: value.displayName,
    email,
    id,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    source: value.source ?? "manual",
    timezone: value.timezone,
    updatedAt: value.updatedAt,
  }) as UserProfileDocument;
};

export const parseLabelDefinition = (input: unknown): LabelDefinitionDocument => {
  if (input === null || typeof input !== "object") throw new Error("label must be an object");

  const value = input as Partial<LabelDefinitionDocument>;

  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.color !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    value.createdBy === undefined
  ) {
    throw new Error("label is missing required fields");
  }

  validateSafeSegment("label id", value.id);
  validateRequiredString("label name", value.name);
  validateRequiredString("label color", value.color);

  return stripUndefined({
    archivedAt: value.archivedAt,
    color: value.color,
    createdAt: value.createdAt,
    createdBy: value.createdBy,
    description: value.description,
    id: normalizeKey(value.id),
    name: value.name,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: value.updatedAt,
  }) as LabelDefinitionDocument;
};

export const parseSavedView = (input: unknown): SavedViewDocument => {
  if (input === null || typeof input !== "object") throw new Error("view must be an object");

  const value = input as Partial<SavedViewDocument>;

  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.kind !== "string" ||
    typeof value.groupBy !== "string" ||
    typeof value.pinned !== "boolean" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    value.createdBy === undefined
  ) {
    throw new Error("view is missing required fields");
  }

  validateSavedViewKind(value.kind);
  validateSavedViewGroup(value.groupBy);
  validateSafeSegment("view id", value.id);
  validateRequiredString("view name", value.name);

  return stripUndefined({
    builtIn: value.builtIn,
    createdAt: value.createdAt,
    createdBy: value.createdBy,
    description: value.description,
    display: value.display,
    groupBy: value.groupBy,
    id: value.id,
    kind: value.kind,
    name: value.name,
    ownerUserId: value.ownerUserId,
    pinned: value.pinned,
    query: value.query ?? {},
    repositoryScope: value.repositoryScope,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sort: value.sort,
    updatedAt: value.updatedAt,
  }) as SavedViewDocument;
};

export const parseIssueTemplate = (input: unknown): IssueTemplateDocument => {
  if (input === null || typeof input !== "object") throw new Error("template must be an object");

  const value = input as Partial<IssueTemplateDocument>;

  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.kind !== "string" ||
    typeof value.titleTemplate !== "string" ||
    typeof value.bodyTemplate !== "string" ||
    typeof value.active !== "boolean" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    value.createdBy === undefined
  ) {
    throw new Error("template is missing required fields");
  }

  validateSafeSegment("template id", value.id);
  validateIssueTemplateKind(value.kind);
  validateRequiredString("template name", value.name);

  return stripUndefined({
    active: value.active,
    bodyTemplate: value.bodyTemplate,
    childTemplates: value.childTemplates,
    createdAt: value.createdAt,
    createdBy: value.createdBy,
    defaults: value.defaults,
    description: value.description,
    id: value.id,
    kind: value.kind,
    name: value.name,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    titleTemplate: value.titleTemplate,
    updatedAt: value.updatedAt,
  }) as IssueTemplateDocument;
};

export const parseRecord = (input: unknown): LinkedRecord => {
  if (input === null || typeof input !== "object") throw new Error("record must be an object");

  const value = input as Partial<LinkedRecord>;

  if (
    typeof value.id !== "string" ||
    typeof value.issueId !== "string" ||
    typeof value.recordType !== "string" ||
    typeof value.createdAt !== "string" ||
    value.createdBy === undefined
  ) {
    throw new Error("record is missing required fields");
  }

  return {
    createdAt: value.createdAt,
    createdBy: value.createdBy,
    createdDate: value.createdDate ?? updatedDateKey(value.createdAt),
    id: value.id,
    issueId: value.issueId,
    payload: value.payload,
    recordType: normalizeKey(value.recordType),
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
};

export const makeRecordId = (ticketId: string, recordType: string, recordId: string): string =>
  `${ticketId}_${normalizeKey(recordType)}_${recordId}`;

export const ticketIdFromRecordId = (recordId: string): string | undefined => {
  const marker = recordId.indexOf("_");

  if (marker === -1) return undefined;

  return recordId.slice(0, marker);
};

export const warning = (
  repositoryId: string,
  snapshotId: string,
  path: string,
  objectType: string,
  objectId: string | undefined,
  cause: unknown,
  createdAt: string,
  reason = "invalid-source-object",
): MaterializationWarning => ({
  createdAt,
  message: cause instanceof Error ? cause.message : String(cause),
  objectId,
  objectType,
  path,
  reason,
  repositoryId,
  snapshotId,
});

export const gitIdentity = (actor: Actor) => ({
  email: actor.email ?? "",
  name: actor.name,
});

export const nowIso = (): string => new Date().toISOString();

export const elapsedMs = (startedAt: number): number =>
  Number((performance.now() - startedAt).toFixed(2));

export const nextEventId = (
  ids: DatabaseIdGeneratorShape,
): Effect.Effect<string, DatabaseFailure> => {
  const maybeIds = ids as Partial<DatabaseIdGeneratorShape>;

  return maybeIds.eventId ?? ids.recordId;
};

export const storage = <A, E>(
  operation: string,
  effect: Effect.Effect<A, E>,
): Effect.Effect<A, DatabaseFailure> =>
  effect.pipe(
    Effect.mapError(
      (cause) =>
        new DatabaseStorageError({
          operation: operation,
          cause: cause,
          message: `GitDB operation failed: ${operation}`,
        }),
    ),
  );

export const sqlite = <A>(operation: string, f: () => A): Effect.Effect<A, DatabaseFailure> =>
  Effect.try({
    catch: (cause) =>
      new DatabaseSqliteError({
        operation: operation,
        cause: cause,
        message: `SQLite operation failed: ${operation}`,
      }),
    try: f,
  });
