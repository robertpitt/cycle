import type { TicketDocument, TicketQuery } from "../../domain/index.ts";
import { normalizeKey, ticketReferenceKey } from "../../domain/index.ts";

export type SqlValue = null | number | string;

export type TicketQueryPlan = {
  readonly params: ReadonlyArray<SqlValue>;
  readonly source: string;
};

export const placeholders = (count: number): string =>
  Array.from({ length: count }, () => "?").join(", ");

const searchTerms = (text: string): ReadonlyArray<string> =>
  text.toLocaleLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];

const toFtsQuery = (text: string): string => {
  const terms = searchTerms(text).map((term) => term.replaceAll('"', '""'));
  return terms.length === 0 ? '""' : terms.map((term) => `"${term}"*`).join(" AND ");
};

const escapeLike = (value: string): string =>
  value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");

export const ticketSearchValues = (text: string) => {
  const referenceExact = text.trim().toLocaleLowerCase();
  return {
    ftsQuery: toFtsQuery(text),
    referenceExact,
    referencePrefix: `${escapeLike(referenceExact)}%`,
  };
};

export const matchedFields = (
  ticket: TicketDocument,
  text: string,
): ReadonlyArray<"body" | "reference" | "title"> => {
  const fields = new Set<"body" | "reference" | "title">();
  const normalized = text.trim().toLocaleLowerCase();
  const terms = searchTerms(text);
  const matches = (value: string): boolean => {
    const candidate = value.toLocaleLowerCase();
    return terms.some((term) => candidate.includes(term));
  };

  if (ticket.id.toLocaleLowerCase().startsWith(normalized)) fields.add("reference");
  if (matches(ticket.frontmatter.title)) fields.add("title");
  if (matches(ticket.body)) fields.add("body");
  return [...fields];
};

export const buildTicketQueryPlan = (
  query: TicketQuery,
  limit: number,
  offset: number,
): TicketQueryPlan => {
  const filters: Array<string> = [];
  const params: Array<SqlValue> = [];

  if (query.repositoryIds !== undefined && query.repositoryIds.length > 0) {
    filters.push(`t.repository_id IN (${placeholders(query.repositoryIds.length)})`);
    params.push(...query.repositoryIds);
  }
  filters.push(query.archived === true ? "t.archived_at IS NOT NULL" : "t.archived_at IS NULL");
  filters.push(query.deleted === true ? "t.deleted_at IS NOT NULL" : "t.deleted_at IS NULL");
  if (query.status !== undefined) {
    filters.push("t.status = ?");
    params.push(normalizeKey(query.status));
  }
  if (query.statusIn !== undefined && query.statusIn.length > 0) {
    filters.push(`t.status IN (${placeholders(query.statusIn.length)})`);
    params.push(...query.statusIn.map((status) => normalizeKey(status)));
  }
  if (query.priority !== undefined) {
    filters.push("t.priority = ?");
    params.push(normalizeKey(query.priority));
  }
  if (query.priorityIn !== undefined && query.priorityIn.length > 0) {
    filters.push(`t.priority IN (${placeholders(query.priorityIn.length)})`);
    params.push(...query.priorityIn.map((priority) => normalizeKey(priority)));
  }
  if (query.type !== undefined) {
    filters.push("t.type = ?");
    params.push(normalizeKey(query.type));
  }
  if (query.assignee !== undefined) {
    if (query.assignee === null) filters.push("(t.assignee IS NULL OR t.assignee = 'none')");
    else {
      filters.push("t.assignee = ?");
      params.push(normalizeKey(query.assignee));
    }
  }
  if (query.assigneeIn !== undefined && query.assigneeIn.length > 0) {
    filters.push(`t.assignee IN (${placeholders(query.assigneeIn.length)})`);
    params.push(...query.assigneeIn.map((assignee) => normalizeKey(assignee)));
  }
  if (query.hasAssignee === true) filters.push("t.assignee IS NOT NULL AND t.assignee != 'none'");
  else if (query.hasAssignee === false) filters.push("(t.assignee IS NULL OR t.assignee = 'none')");
  if (query.parent !== undefined) {
    filters.push("t.parent_id = ?");
    params.push(ticketReferenceKey(query.parent));
  }
  if (query.label !== undefined) {
    filters.push(`EXISTS (
      SELECT 1 FROM ticket_labels l
      WHERE l.repository_id = t.repository_id
        AND l.ticket_id = t.ticket_id
        AND l.label = ?
    )`);
    params.push(normalizeKey(query.label));
  }
  if (query.labelIn !== undefined && query.labelIn.length > 0) {
    filters.push(`EXISTS (
      SELECT 1 FROM ticket_labels l
      WHERE l.repository_id = t.repository_id
        AND l.ticket_id = t.ticket_id
        AND l.label IN (${placeholders(query.labelIn.length)})
    )`);
    params.push(...query.labelIn.map((label) => normalizeKey(label)));
  }
  if (query.hasLabels === true) {
    filters.push(`EXISTS (
      SELECT 1 FROM ticket_labels l
      WHERE l.repository_id = t.repository_id AND l.ticket_id = t.ticket_id
    )`);
  } else if (query.hasLabels === false) {
    filters.push(`NOT EXISTS (
      SELECT 1 FROM ticket_labels l
      WHERE l.repository_id = t.repository_id AND l.ticket_id = t.ticket_id
    )`);
  }
  if (query.dueAfter !== undefined) {
    filters.push("t.due_date >= ?");
    params.push(query.dueAfter);
  }
  if (query.dueBefore !== undefined) {
    filters.push("t.due_date <= ?");
    params.push(query.dueBefore);
  }
  if (query.estimate !== undefined) {
    filters.push("t.estimate = ?");
    params.push(String(query.estimate));
  }
  if (query.hasDueDate === true) filters.push("t.due_date IS NOT NULL");
  else if (query.hasDueDate === false) filters.push("t.due_date IS NULL");
  if (query.hasEstimate === true) filters.push("t.estimate IS NOT NULL");
  else if (query.hasEstimate === false) filters.push("t.estimate IS NULL");
  if (query.relation !== undefined) {
    const relationFilters = ["r.repository_id = t.repository_id", "r.ticket_id = t.ticket_id"];
    if (query.relation.issueId !== undefined) {
      relationFilters.push("r.related_issue_id = ?");
      params.push(query.relation.issueId);
    }
    if (query.relation.type !== undefined) {
      relationFilters.push("r.relation_type = ?");
      params.push(query.relation.type);
    }
    filters.push(`EXISTS (
      SELECT 1 FROM ticket_relations r
      WHERE ${relationFilters.join(" AND ")}
    )`);
  }
  if (query.blocked === true) {
    filters.push(`EXISTS (
      SELECT 1 FROM ticket_relations r
      JOIN tickets prerequisite
        ON prerequisite.repository_id = r.repository_id
       AND prerequisite.ticket_id = r.related_issue_id
      WHERE r.repository_id = t.repository_id
        AND r.ticket_id = t.ticket_id
        AND r.relation_type IN ('depends_on', 'blocked-by')
        AND prerequisite.status NOT IN ('done', 'closed', 'completed')
        AND prerequisite.archived_at IS NULL
        AND prerequisite.deleted_at IS NULL
    )`);
  } else if (query.blocked === false) {
    filters.push(`NOT EXISTS (
      SELECT 1 FROM ticket_relations r
      JOIN tickets prerequisite
        ON prerequisite.repository_id = r.repository_id
       AND prerequisite.ticket_id = r.related_issue_id
      WHERE r.repository_id = t.repository_id
        AND r.ticket_id = t.ticket_id
        AND r.relation_type IN ('depends_on', 'blocked-by')
        AND prerequisite.status NOT IN ('done', 'closed', 'completed')
        AND prerequisite.archived_at IS NULL
        AND prerequisite.deleted_at IS NULL
    )`);
  }
  if (query.text !== undefined && query.text.trim().length > 0) {
    const search = ticketSearchValues(query.text);
    filters.push(`(lower(t.ticket_id) LIKE ? ESCAPE '\\'
      OR EXISTS (
        SELECT 1
        FROM search_fts f
        JOIN search_documents d
          ON d.repository_id = f.repository_id AND d.document_id = f.document_id
        WHERE f.repository_id = t.repository_id
          AND f.ticket_id = t.ticket_id
          AND d.source_type = 'ticket'
          AND search_fts MATCH ?
      ))`);
    params.push(search.referencePrefix, search.ftsQuery);
  }
  if (query.updatedAfter !== undefined) {
    filters.push("t.updated_at >= ?");
    params.push(query.updatedAfter);
  }
  if (query.updatedBefore !== undefined) {
    filters.push("t.updated_at <= ?");
    params.push(query.updatedBefore);
  }
  if (query.staleBefore !== undefined) {
    filters.push("t.updated_at < ?");
    params.push(query.staleBefore);
  }

  const orderColumn =
    query.orderBy === "createdAt"
      ? "created_at"
      : query.orderBy === "dueDate"
        ? "due_date"
        : query.orderBy === "priority"
          ? "priority"
          : query.orderBy === "title"
            ? "title"
            : "updated_at";
  const direction = query.orderDirection === "asc" ? "ASC" : "DESC";
  const search =
    query.text !== undefined && query.text.trim().length > 0
      ? ticketSearchValues(query.text)
      : undefined;
  const order =
    search === undefined
      ? `t.${orderColumn} ${direction}, t.ticket_id ASC`
      : `CASE
           WHEN lower(t.ticket_id) = ? THEN 0
           WHEN lower(t.ticket_id) LIKE ? ESCAPE '\\' THEN 1
           ELSE 2
         END ASC,
         COALESCE((
           SELECT bm25(search_fts, 0.0, 0.0, 0.0, 8.0, 1.0)
           FROM search_fts f
           JOIN search_documents d
             ON d.repository_id = f.repository_id AND d.document_id = f.document_id
           WHERE f.repository_id = t.repository_id
             AND f.ticket_id = t.ticket_id
             AND d.source_type = 'ticket'
             AND search_fts MATCH ?
           LIMIT 1
         ), 0.0) ASC,
         t.updated_at DESC,
         t.ticket_id ASC`;
  const orderParams =
    search === undefined ? [] : [search.referenceExact, search.referencePrefix, search.ftsQuery];
  const where = filters.length === 0 ? "" : `WHERE ${filters.join(" AND ")}`;

  return {
    params: [...params, ...orderParams, limit + 1, offset],
    source: `SELECT t.*
      FROM tickets t
      ${where}
      ORDER BY ${order}
      LIMIT ? OFFSET ?`,
  };
};
