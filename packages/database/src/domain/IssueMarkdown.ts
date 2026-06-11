import { makeIssueFrontmatter, makeTicketDocument } from "./TicketDocument.ts";
import type { IssueFrontmatter, TicketDocument } from "./Types.ts";

const FRONTMATTER_ORDER = [
  "id",
  "title",
  "type",
  "status",
  "priority",
  "assignee",
  "dueDate",
  "estimate",
  "labels",
  "parent",
  "children",
  "relations",
  "duplicateOf",
  "repository",
  "planningNotRequired",
  "externalLinks",
  "agentProvenance",
  "planAcceptedAt",
  "planAcceptedBy",
  "archivedAt",
  "archivedBy",
  "deletedAt",
  "deletedBy",
  "createdAt",
  "updatedAt",
  "createdBy",
] as const;

export const serializeIssueMarkdown = (issue: TicketDocument): string => {
  const ordered = orderedFrontmatterEntries(issue.frontmatter);
  const header = ordered
    .map(([key, value]) => `${key}: ${formatFrontmatterValue(value)}`)
    .join("\n");

  return `---\n${header}\n---\n\n${issue.body}`;
};

export const parseIssueMarkdown = (markdown: string): TicketDocument => {
  const normalized = markdown.replace(/\r\n/gu, "\n");

  if (!normalized.startsWith("---\n")) {
    throw new Error("Issue Markdown must start with frontmatter.");
  }

  const closeIndex = normalized.indexOf("\n---", "---\n".length);

  if (closeIndex === -1) {
    throw new Error("Issue Markdown frontmatter is not closed.");
  }

  const header = normalized.slice("---\n".length, closeIndex);
  const afterFence = normalized.slice(closeIndex + "\n---".length);
  const body = afterFence.startsWith("\n\n")
    ? afterFence.slice(2)
    : afterFence.startsWith("\n")
      ? afterFence.slice(1)
      : afterFence;
  const frontmatter = parseFrontmatterHeader(header) as IssueFrontmatter;

  return makeTicketDocument(makeIssueFrontmatter(frontmatter), body);
};

export const parseLegacyIssueJson = (json: unknown): TicketDocument => {
  if (json === null || typeof json !== "object") {
    throw new Error("Legacy issue JSON must be an object.");
  }

  const input = json as Partial<TicketDocument>;

  if (input.frontmatter === undefined || input.body === undefined) {
    throw new Error("Legacy issue JSON must contain frontmatter and body.");
  }

  return makeTicketDocument(makeIssueFrontmatter(input.frontmatter), input.body);
};

const orderedFrontmatterEntries = (
  frontmatter: IssueFrontmatter,
): ReadonlyArray<readonly [string, unknown]> => {
  const seen = new Set<string>();
  const entries: Array<readonly [string, unknown]> = [];

  for (const key of FRONTMATTER_ORDER) {
    const value = frontmatter[key];

    if (value !== undefined) {
      entries.push([key, value]);
      seen.add(key);
    }
  }

  for (const key of Object.keys(frontmatter).sort()) {
    if (seen.has(key)) continue;

    const value = frontmatter[key];

    if (value !== undefined) {
      entries.push([key, value]);
    }
  }

  return entries;
};

const formatFrontmatterValue = (value: unknown): string => {
  if (value === undefined) {
    throw new TypeError("Cannot serialize undefined frontmatter value.");
  }

  return JSON.stringify(value);
};

const parseFrontmatterHeader = (header: string): Record<string, unknown> => {
  const output: Record<string, unknown> = {};

  for (const rawLine of header.split("\n")) {
    const line = rawLine.trimEnd();

    if (line.length === 0) continue;

    const separator = line.indexOf(":");

    if (separator <= 0) {
      throw new Error(`Invalid frontmatter line: ${line}`);
    }

    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();

    output[key] = parseFrontmatterValue(rawValue);
  }

  return output;
};

const parseFrontmatterValue = (value: string): unknown => {
  if (value.length === 0) return "";

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};
