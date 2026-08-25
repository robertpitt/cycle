import { Effect } from "effect";
import {
  CURRENT_SCHEMA_VERSION,
  normalizeKey,
  stripUndefined,
  type CycleRepositoryMetadata,
  type IssueTemplateDocument,
  type LabelDefinitionDocument,
  type SavedViewDocument,
  type UserProfileDocument,
} from "../../domain/index.ts";
import { DatabaseValidationError, type DatabaseFailure } from "../../DatabaseErrors.ts";
import {
  DEFAULT_TICKET_PREFIX,
  validateIssueTemplateKind,
  validateRequiredString,
  validateSafeSegment,
  validateSavedViewGroup,
  validateSavedViewKind,
} from "./TicketCommandRules.ts";
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
