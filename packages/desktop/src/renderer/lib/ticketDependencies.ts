import type { TicketDocument } from "@cycle/contracts/schemas";

export type TicketDependencyViewTicket = {
  readonly id: string;
  readonly status: string;
  readonly title: string;
};

export type TicketDependencyViewState = {
  readonly blocked: boolean;
  readonly blockingTickets: ReadonlyArray<TicketDependencyViewTicket>;
  readonly dependencyTickets: ReadonlyArray<TicketDependencyViewTicket>;
  readonly downstreamBlockedTickets: ReadonlyArray<TicketDependencyViewTicket>;
  readonly downstreamTickets: ReadonlyArray<TicketDependencyViewTicket>;
  readonly relatedTickets: ReadonlyArray<TicketDependencyViewTicket>;
  readonly warnings: ReadonlyArray<string>;
};

const finishedStatuses = new Set(["done", "closed", "completed"]);

const isFinished = (ticket: TicketDocument): boolean =>
  finishedStatuses.has(ticket.status) ||
  ticket.archivedAt !== undefined ||
  ticket.deletedAt !== undefined;

const dependencyIds = (ticket: TicketDocument): ReadonlyArray<string> =>
  (ticket.frontmatter.relations ?? []).flatMap((relation) =>
    relation.type === "depends_on" || relation.type === "blocked-by" ? [relation.issueId] : [],
  );

const downstreamIds = (ticket: TicketDocument): ReadonlyArray<string> =>
  (ticket.frontmatter.relations ?? []).flatMap((relation) =>
    relation.type === "blocks" || relation.type === "blocking" ? [relation.issueId] : [],
  );

const relatedIds = (ticket: TicketDocument): ReadonlyArray<string> =>
  (ticket.frontmatter.relations ?? []).flatMap((relation) =>
    relation.type === "related" ? [relation.issueId] : [],
  );

const hasCycle = (
  ticket: TicketDocument,
  ticketsById: ReadonlyMap<string, TicketDocument>,
): boolean => {
  const pending = [...dependencyIds(ticket)];
  const visited = new Set<string>();

  while (pending.length > 0) {
    const currentId = pending.pop();
    if (currentId === undefined || visited.has(currentId)) continue;
    if (currentId === ticket.id) return true;

    visited.add(currentId);
    const current = ticketsById.get(currentId);
    if (current !== undefined) pending.push(...dependencyIds(current));
  }

  return false;
};

const viewTicket = (ticket: TicketDocument): TicketDependencyViewTicket => ({
  id: ticket.id,
  status: ticket.status,
  title: ticket.title,
});

export const mapTicketDependencies = (
  ticket: TicketDocument,
  repositoryTickets: ReadonlyArray<TicketDocument>,
  options: { readonly reportMissing?: boolean } = {},
): TicketDependencyViewState => {
  const ticketsById = new Map(repositoryTickets.map((entry) => [entry.id, entry] as const));
  ticketsById.set(ticket.id, ticket);
  const missingPrerequisiteIds = new Set<string>();
  const missingDownstreamIds = new Set<string>();
  const missingRelatedIds = new Set<string>();
  const reportMissing = options.reportMissing ?? true;

  const prerequisites = [...new Set(dependencyIds(ticket))].flatMap((id) => {
    const prerequisite = ticketsById.get(id);
    if (prerequisite !== undefined) return [prerequisite];
    if (reportMissing) missingPrerequisiteIds.add(id);
    return [];
  });
  const downstream = [...new Set(downstreamIds(ticket))].flatMap((id) => {
    const dependent = ticketsById.get(id);
    if (dependent !== undefined) return [dependent];
    if (reportMissing) missingDownstreamIds.add(id);
    return [];
  });
  const related = [...new Set(relatedIds(ticket))].flatMap((id) => {
    const relatedTicket = ticketsById.get(id);
    if (relatedTicket !== undefined) return [relatedTicket];
    if (reportMissing) missingRelatedIds.add(id);
    return [];
  });
  const blockingTickets = prerequisites.filter((prerequisite) => !isFinished(prerequisite));
  const warnings = [
    ...(blockingTickets.length === 0
      ? []
      : [
          `Blocked by ${blockingTickets.length} unfinished prerequisite${blockingTickets.length === 1 ? "" : "s"}.`,
        ]),
    ...(missingPrerequisiteIds.size === 0 &&
    missingDownstreamIds.size === 0 &&
    missingRelatedIds.size === 0
      ? []
      : [
          `Relationship tickets unavailable: ${[
            ...missingPrerequisiteIds,
            ...missingDownstreamIds,
            ...missingRelatedIds,
          ]
            .sort()
            .join(", ")}.`,
        ]),
    ...(hasCycle(ticket, ticketsById) ? ["Circular dependency detected."] : []),
  ];

  return {
    blocked: blockingTickets.length > 0 || missingPrerequisiteIds.size > 0,
    blockingTickets: blockingTickets.map(viewTicket),
    dependencyTickets: prerequisites.map(viewTicket),
    downstreamBlockedTickets: isFinished(ticket)
      ? []
      : downstream.filter((dependent) => !isFinished(dependent)).map(viewTicket),
    downstreamTickets: downstream.map(viewTicket),
    relatedTickets: related.map(viewTicket),
    warnings,
  };
};

export const mapTicketSubIssues = (
  ticket: TicketDocument,
  repositoryTickets: ReadonlyArray<TicketDocument>,
): ReadonlyArray<TicketDependencyViewTicket> =>
  repositoryTickets
    .filter((candidate) => candidate.frontmatter.parent === ticket.id)
    .map(viewTicket)
    .sort((left, right) => left.id.localeCompare(right.id));
