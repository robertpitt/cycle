import type { TicketQuery } from "@cycle/contracts";
import type { SavedViewDocument } from "@cycle/contracts/schemas";
import { ViewsPanel as UiViewsPanel, type ViewsPanelRow } from "@cycle/ui/organisms";
import * as React from "react";
import {
  useArchiveSavedViewMutation,
  useCreateSavedViewMutation,
  useUpdateSavedViewMutation,
} from "../mutations/index.ts";
import { useSavedViewListQuery, useUserListQuery } from "../queries/index.ts";

type ViewsPanelProps = {
  readonly onViewSelect?: (view: SavedViewDocument) => void;
  readonly repositoryId?: string;
};

const titleForValue = (value: string): string =>
  value
    .split(/[-_\s]+/u)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");

const summarizeQuery = (query: TicketQuery): string => {
  const parts: string[] = [];

  if (query.text) parts.push(`search: ${query.text}`);
  if (query.statusIn && query.statusIn.length > 0) {
    parts.push(`status: ${query.statusIn.map(titleForValue).join(", ")}`);
  } else if (query.status) {
    parts.push(`status: ${titleForValue(query.status)}`);
  }
  if (query.priorityIn && query.priorityIn.length > 0) {
    parts.push(`priority: ${query.priorityIn.map(titleForValue).join(", ")}`);
  } else if (query.priority) {
    parts.push(`priority: ${titleForValue(query.priority)}`);
  }
  if (query.labelIn && query.labelIn.length > 0) {
    parts.push(`labels: ${query.labelIn.join(", ")}`);
  } else if (query.label) {
    parts.push(`label: ${query.label}`);
  }
  if (query.assigneeIn && query.assigneeIn.length > 0) {
    parts.push(`assignees: ${query.assigneeIn.length}`);
  } else if (query.assignee) {
    parts.push(`assignee: ${query.assignee}`);
  }
  if (query.hasAssignee === false) parts.push("unassigned");
  if (query.hasLabels === false) parts.push("unlabeled");
  if (query.blocked === true) parts.push("blocked");
  if (query.type) parts.push(`type: ${titleForValue(query.type)}`);

  return parts.length > 0 ? parts.join(" · ") : "All active issues";
};

const kindLabel = (view: SavedViewDocument): string =>
  `${titleForValue(view.kind)} · grouped by ${titleForValue(view.groupBy)}`;

export const ViewsPanel = ({ onViewSelect, repositoryId }: ViewsPanelProps) => {
  const viewsQuery = useSavedViewListQuery(repositoryId);
  const usersQuery = useUserListQuery(repositoryId, {
    disabled: false,
  });
  const createSavedView = useCreateSavedViewMutation({
    repositoryId,
  });
  const updateSavedView = useUpdateSavedViewMutation({ repositoryId });
  const archiveSavedView = useArchiveSavedViewMutation({ repositoryId });
  const usersById = React.useMemo(
    () => new Map((usersQuery.data?.entries ?? []).map((user) => [user.id, user] as const)),
    [usersQuery.data?.entries],
  );
  const views = viewsQuery.data?.entries ?? [];
  const viewsById = React.useMemo(() => new Map(views.map((view) => [view.id, view])), [views]);
  const rows = React.useMemo(
    () =>
      views.map((view): ViewsPanelRow => {
        const owner = view.ownerUserId ? usersById.get(view.ownerUserId) : undefined;
        const ownerName = owner?.displayName ?? view.createdBy.name;
        const layoutLabel = kindLabel(view);
        const filterSummary = summarizeQuery(view.query);

        return {
          description: view.description,
          filterSummary,
          id: view.id,
          layoutLabel,
          name: view.name,
          ownerName,
          pinned: view.pinned,
          scopeLabel: view.builtIn ? "Default" : "Shared",
          searchText: [view.name, view.description, layoutLabel, filterSummary, ownerName]
            .filter(Boolean)
            .join(" "),
          updatedAt: view.updatedAt,
        };
      }),
    [usersById, views],
  );
  const createView = React.useCallback(() => {
    const name = window.prompt("View name");
    const trimmedName = name?.trim();

    if (!trimmedName) return;

    createSavedView.mutate({
      groupBy: "status",
      kind: "list",
      name: trimmedName,
      pinned: true,
      query: {},
    });
  }, [createSavedView]);
  const viewForRow = (row: ViewsPanelRow): SavedViewDocument | undefined => viewsById.get(row.id);
  const renameView = (row: ViewsPanelRow) => {
    const view = viewForRow(row);
    if (!view) return;
    const name = window.prompt("View name", view.name)?.trim();
    if (!name) return;
    const description = window.prompt("View description", view.description ?? "");
    if (description === null) return;
    const nextDescription = description.trim();
    if (name === view.name && nextDescription === (view.description ?? "")) return;
    updateSavedView.mutate({
      id: view.id,
      patch: { description: nextDescription, name },
    });
  };
  const duplicateView = (row: ViewsPanelRow) => {
    const view = viewForRow(row);
    if (!view) return;
    createSavedView.mutate({
      ...(view.description === undefined ? {} : { description: view.description }),
      ...(view.display === undefined ? {} : { display: view.display }),
      groupBy: view.groupBy,
      kind: view.kind,
      name: `${view.name} copy`,
      pinned: false,
      query: view.query,
      ...(view.sort === undefined ? {} : { sort: view.sort }),
    });
  };
  const archiveView = (row: ViewsPanelRow) => {
    const view = viewForRow(row);
    if (!view || !window.confirm(`Archive “${view.name}”?`)) return;
    archiveSavedView.mutate(view.id);
  };

  return (
    <UiViewsPanel
      createDisabled={!repositoryId || createSavedView.isPending}
      creating={createSavedView.isPending}
      error={
        viewsQuery.error instanceof Error
          ? viewsQuery.error.message
          : updateSavedView.error instanceof Error
            ? updateSavedView.error.message
            : archiveSavedView.error instanceof Error
              ? archiveSavedView.error.message
              : createSavedView.error instanceof Error
                ? createSavedView.error.message
                : undefined
      }
      loading={viewsQuery.isLoading}
      onCreateView={createView}
      onViewArchive={archiveView}
      onViewDuplicate={duplicateView}
      onViewPinnedChange={(row, pinned) => {
        const view = viewForRow(row);
        if (view) updateSavedView.mutate({ id: view.id, patch: { pinned } });
      }}
      onViewRename={renameView}
      onViewSelect={(row) => {
        const view = viewsById.get(row.id);
        if (view) onViewSelect?.(view);
      }}
      repositorySelected={Boolean(repositoryId)}
      rows={rows}
    />
  );
};
