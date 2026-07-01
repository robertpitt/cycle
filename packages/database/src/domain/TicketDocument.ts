import type { Actor, CreateTicketInput, IssueFrontmatter, TicketDocument } from "./Types.ts";
import { materializeTicketType } from "./TicketType.ts";

export const CURRENT_SCHEMA_VERSION = 1 as const;

export const normalizeKey = (value: unknown, fallback = "none"): string => {
  if (value === null || value === undefined) return fallback;

  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^[._-]+/u, "")
    .replace(/[._-]+$/u, "");

  return normalized.length === 0 ? fallback : normalized;
};

export const actorKey = (actor: Actor): string => normalizeKey(actor.email ?? actor.name);

export const updatedDateKey = (iso: string): string => iso.slice(0, 10);

export const ticketReferenceKey = (value: unknown, fallback = "none"): string => {
  if (value === null || value === undefined) return fallback;

  const normalized = String(value).trim();

  return normalized.length === 0 ? fallback : normalized;
};

export const makeIssueFrontmatter = (
  input: IssueFrontmatter & Readonly<Record<string, unknown>>,
): IssueFrontmatter => stripUndefined(input) as IssueFrontmatter;

export const makeTicketDocument = (frontmatter: IssueFrontmatter, body: string): TicketDocument => {
  const normalizedFrontmatter = makeIssueFrontmatter(frontmatter);
  const type = materializeTicketType(normalizedFrontmatter.type);

  return stripUndefined({
    archivedAt: normalizedFrontmatter.archivedAt ?? undefined,
    assignee: normalizeKey(normalizedFrontmatter.assignee),
    body,
    bodyFormat: "markdown" as const,
    createdBy: actorKey(normalizedFrontmatter.createdBy),
    deletedAt: normalizedFrontmatter.deletedAt ?? undefined,
    dueDate: normalizedFrontmatter.dueDate ?? undefined,
    estimate: normalizedFrontmatter.estimate ?? undefined,
    frontmatter: normalizedFrontmatter,
    id: normalizedFrontmatter.id,
    labels: normalizedFrontmatter.labels?.map((label) => normalizeKey(label)),
    parent: ticketReferenceKey(normalizedFrontmatter.parent),
    priority: normalizeKey(normalizedFrontmatter.priority),
    relations: normalizedFrontmatter.relations,
    repository:
      normalizedFrontmatter.repository === undefined
        ? undefined
        : normalizeKey(normalizedFrontmatter.repository),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    status: normalizeKey(normalizedFrontmatter.status),
    title: normalizedFrontmatter.title,
    type: type.type,
    updatedDate: updatedDateKey(normalizedFrontmatter.updatedAt),
  }) as TicketDocument;
};

export const makeFrontmatter = (
  input: CreateTicketInput,
  id: string,
  actor: Actor,
  now: string,
): IssueFrontmatter =>
  makeIssueFrontmatter({
    assignee: input.assignee,
    createdAt: now,
    createdBy: actor,
    dueDate: input.dueDate,
    estimate: input.estimate,
    externalLinks: input.externalLinks,
    id,
    labels: input.labels,
    parent: input.parent,
    planningNotRequired: input.planningNotRequired,
    priority: input.priority ?? "none",
    repository: input.repository,
    status: input.status ?? "backlog",
    title: input.title,
    type: input.type,
    updatedAt: now,
  });

export const updateTicketDocument = (
  ticket: TicketDocument,
  frontmatter: IssueFrontmatter,
  body = ticket.body,
): TicketDocument => makeTicketDocument(frontmatter, body);

export const stripUndefined = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value === null || typeof value !== "object") return value;

  const entries = Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .map(([key, entry]) => [key, stripUndefined(entry)] as const);

  return Object.fromEntries(entries);
};
