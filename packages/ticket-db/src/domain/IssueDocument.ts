import { CURRENT_SCHEMA_VERSION } from "../constants.ts";
import { Actor } from "../schemas/Actor.ts";
import { DraftSession } from "../schemas/DraftSession.ts";
import { IssueDocument } from "../schemas/IssueDocument.ts";
import { IssueFrontmatter } from "../schemas/IssueFrontmatter.ts";
import { LinkedRecord } from "../schemas/LinkedRecord.ts";

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

export const makeIssueDocument = (frontmatter: IssueFrontmatter, body: string): IssueDocument => {
  const frontmatterValue = makeIssueFrontmatter(frontmatter);
  const document = {
    assignee: normalizeKey(frontmatter.assignee),
    body,
    bodyFormat: "markdown" as const,
    createdBy: actorKey(frontmatter.createdBy),
    frontmatter: frontmatterValue,
    id: frontmatter.id,
    labels: frontmatter.labels?.map((label) => normalizeKey(label)),
    parent: normalizeKey(frontmatter.parent),
    priority: normalizeKey(frontmatter.priority),
    repository:
      frontmatter.repository === undefined ? undefined : normalizeKey(frontmatter.repository),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    status: normalizeKey(frontmatter.status),
    type: normalizeKey(frontmatter.type),
    updatedDate: updatedDateKey(frontmatter.updatedAt),
  };
  const issue = new IssueDocument(stripUndefined(document) as typeof IssueDocument.Type);

  Object.defineProperty(issue, "frontmatter", {
    configurable: true,
    enumerable: true,
    value: frontmatterValue,
  });

  return issue;
};

const stripUndefined = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value === null || typeof value !== "object") return value;

  const entries = Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .map(([key, entry]) => [key, stripUndefined(entry)] as const);

  return Object.fromEntries(entries);
};

const ISSUE_FRONTMATTER_KEYS = new Set([
  "agentProvenance",
  "assignee",
  "children",
  "createdAt",
  "createdBy",
  "externalLinks",
  "id",
  "labels",
  "parent",
  "planAcceptedAt",
  "planAcceptedBy",
  "planningNotRequired",
  "priority",
  "repository",
  "status",
  "title",
  "type",
  "updatedAt",
]);

export const makeIssueFrontmatter = (
  input: typeof IssueFrontmatter.Type & Readonly<Record<string, unknown>>,
): IssueFrontmatter => {
  const stripped = stripUndefined(input) as typeof IssueFrontmatter.Type &
    Readonly<Record<string, unknown>>;
  const frontmatter = new IssueFrontmatter(stripped);

  for (const [key, value] of Object.entries(stripped)) {
    if (!ISSUE_FRONTMATTER_KEYS.has(key)) {
      Object.defineProperty(frontmatter, key, {
        configurable: true,
        enumerable: true,
        value,
      });
    }
  }

  return frontmatter;
};

export const hydrateIssueDocument = (input: IssueDocument): IssueDocument =>
  makeIssueDocument(makeIssueFrontmatter(input.frontmatter), input.body);

export const hydrateLinkedRecord = (input: LinkedRecord): LinkedRecord =>
  new LinkedRecord({
    ...input,
    createdBy: new Actor(input.createdBy),
  });

export const hydrateDraftSession = (input: DraftSession): DraftSession =>
  new DraftSession({
    ...input,
    createdBy: new Actor(input.createdBy),
    issue: hydrateIssueDocument(input.issue),
    records: input.records.map(hydrateLinkedRecord),
  });

export const updateIssueDocument = (
  issue: IssueDocument,
  frontmatter: IssueFrontmatter,
  body = issue.body,
): IssueDocument => makeIssueDocument(frontmatter, body);
