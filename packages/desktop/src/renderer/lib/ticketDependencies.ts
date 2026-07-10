import type { TicketDocument } from "@cycle/contracts/schemas";

export type TicketDependencyViewTicket = {
  readonly id: string;
  readonly status: string;
  readonly title: string;
};

export type TicketDependencyViewState = {
  readonly blocked: boolean;
  readonly blockingTickets: ReadonlyArray<TicketDependencyViewTicket>;
  readonly downstreamBlockedTickets: ReadonlyArray<TicketDependencyViewTicket>;
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
): TicketDependencyViewState => {
  const ticketsById = new Map(repositoryTickets.map((entry) => [entry.id, entry] as const));
  ticketsById.set(ticket.id, ticket);
  const missingPrerequisiteIds = new Set<string>();
  const missingDownstreamIds = new Set<string>();

  const prerequisites = [...new Set(dependencyIds(ticket))].flatMap((id) => {
    const prerequisite = ticketsById.get(id);
    if (prerequisite !== undefined) return [prerequisite];
    missingPrerequisiteIds.add(id);
    return [];
  });
  const downstream = [...new Set(downstreamIds(ticket))].flatMap((id) => {
    const dependent = ticketsById.get(id);
    if (dependent !== undefined) return [dependent];
    missingDownstreamIds.add(id);
    return [];
  });
  const blockingTickets = prerequisites.filter((prerequisite) => !isFinished(prerequisite));
  const warnings = [
    ...(blockingTickets.length === 0
      ? []
      : [
          `Blocked by ${blockingTickets.length} unfinished prerequisite${blockingTickets.length === 1 ? "" : "s"}.`,
        ]),
    ...(missingPrerequisiteIds.size === 0 && missingDownstreamIds.size === 0
      ? []
      : [
          `Dependency tickets unavailable: ${[...missingPrerequisiteIds, ...missingDownstreamIds]
            .sort()
            .join(", ")}.`,
        ]),
    ...(hasCycle(ticket, ticketsById) ? ["Circular dependency detected."] : []),
  ];

  return {
    blocked: blockingTickets.length > 0 || missingPrerequisiteIds.size > 0,
    blockingTickets: blockingTickets.map(viewTicket),
    downstreamBlockedTickets: isFinished(ticket)
      ? []
      : downstream.filter((dependent) => !isFinished(dependent)).map(viewTicket),
    warnings,
  };
};
