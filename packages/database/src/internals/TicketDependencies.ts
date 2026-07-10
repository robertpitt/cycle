import type { IssueRelation, TicketDocument } from "../domain/Types.ts";

type DependencyEdge = {
  readonly dependentId: string;
  readonly prerequisiteId: string;
};

export const dependencyEdge = (
  ticketId: string,
  relation: IssueRelation,
): DependencyEdge | undefined => {
  switch (relation.type) {
    case "depends_on":
    case "blocked-by":
      return { dependentId: ticketId, prerequisiteId: relation.issueId };
    case "blocks":
    case "blocking":
      return { dependentId: relation.issueId, prerequisiteId: ticketId };
    default:
      return undefined;
  }
};

const prerequisiteIds = (ticket: TicketDocument): ReadonlyArray<string> =>
  (ticket.frontmatter.relations ?? []).flatMap((relation) => {
    const edge = dependencyEdge(ticket.id, relation);
    return edge?.dependentId === ticket.id ? [edge.prerequisiteId] : [];
  });

export const createsDependencyCycle = (
  edge: DependencyEdge,
  getTicket: (ticketId: string) => TicketDocument | null,
): boolean => {
  const pending = [edge.prerequisiteId];
  const visited = new Set<string>();

  while (pending.length > 0) {
    const currentId = pending.pop();
    if (currentId === undefined || visited.has(currentId)) continue;
    if (currentId === edge.dependentId) return true;

    visited.add(currentId);
    const current = getTicket(currentId);
    if (current !== null) pending.push(...prerequisiteIds(current));
  }

  return false;
};
