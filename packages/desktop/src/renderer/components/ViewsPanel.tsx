import type { SavedViewDocument, TicketQuery } from "@cycle/database";
import { Button } from "@cycle/ui/atoms";
import { cn } from "@cycle/ui/utils";
import { Layers2, ListFilter, Pin, Plus, Search, Table2, UserRound } from "lucide-react";
import * as React from "react";
import { useCreateSavedViewMutation } from "../mutations/index.ts";
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

const formatDate = (value: string): string => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Unknown";

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
};

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
  const [searchText, setSearchText] = React.useState("");
  const viewsQuery = useSavedViewListQuery(repositoryId);
  const usersQuery = useUserListQuery(repositoryId, {
    disabled: false,
  });
  const createSavedView = useCreateSavedViewMutation({
    repositoryId,
  });
  const usersById = React.useMemo(
    () => new Map((usersQuery.data?.entries ?? []).map((user) => [user.id, user] as const)),
    [usersQuery.data?.entries],
  );
  const views = React.useMemo(() => {
    const needle = searchText.trim().toLowerCase();

    return (viewsQuery.data?.entries ?? []).filter((view) => {
      if (needle.length === 0) return true;

      return (
        view.name.toLowerCase().includes(needle) ||
        summarizeQuery(view.query).toLowerCase().includes(needle) ||
        kindLabel(view).toLowerCase().includes(needle)
      );
    });
  }, [searchText, viewsQuery.data?.entries]);
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

  const renderBody = () => {
    if (!repositoryId) {
      return (
        <tr>
          <td className="px-4 py-10 text-center text-sm text-muted-foreground" colSpan={6}>
            Choose a repository before managing views.
          </td>
        </tr>
      );
    }

    if (viewsQuery.isLoading) {
      return (
        <tr>
          <td className="px-4 py-10 text-center text-sm text-muted-foreground" colSpan={6}>
            Loading views.
          </td>
        </tr>
      );
    }

    if (viewsQuery.error instanceof Error) {
      return (
        <tr>
          <td className="px-4 py-10 text-center text-sm text-destructive" colSpan={6}>
            {viewsQuery.error.message}
          </td>
        </tr>
      );
    }

    if (views.length === 0) {
      return (
        <tr>
          <td className="px-4 py-10 text-center text-sm text-muted-foreground" colSpan={6}>
            No views match this search.
          </td>
        </tr>
      );
    }

    return views.map((view) => {
      const owner = view.ownerUserId ? usersById.get(view.ownerUserId) : undefined;
      const ownerName = owner?.displayName ?? view.createdBy.name;

      return (
        <tr
          className="group border-b border-border/70 transition-colors last:border-b-0 hover:bg-subtle/70"
          key={view.id}
        >
          <td className="w-[34%] px-4 py-3">
            <button
              className="grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-3 text-left"
              onClick={() => onViewSelect?.(view)}
              type="button"
            >
              <span className="grid size-7 place-items-center rounded-md border border-border bg-background text-muted-foreground group-hover:text-foreground">
                <Layers2 aria-hidden className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">
                    {view.name}
                  </span>
                  {view.pinned ? (
                    <Pin aria-hidden className="size-3.5 text-muted-foreground" />
                  ) : null}
                </span>
                {view.description ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {view.description}
                  </span>
                ) : null}
              </span>
            </button>
          </td>
          <td className="px-4 py-3 text-sm text-muted-foreground">{kindLabel(view)}</td>
          <td className="max-w-[24rem] px-4 py-3 text-sm text-muted-foreground">
            <span className="line-clamp-2">{summarizeQuery(view.query)}</span>
          </td>
          <td className="px-4 py-3 text-sm text-muted-foreground">
            {view.builtIn ? "Default" : "Shared"}
          </td>
          <td className="px-4 py-3">
            <span className="inline-flex max-w-44 items-center gap-2 truncate text-sm text-foreground">
              <UserRound aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{ownerName}</span>
            </span>
          </td>
          <td className="px-4 py-3 text-right text-sm text-muted-foreground">
            {formatDate(view.updatedAt)}
          </td>
        </tr>
      );
    });
  };

  return (
    <section className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-8 place-items-center rounded-md border border-border bg-subtle text-muted-foreground">
            <Table2 aria-hidden className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-foreground">Views</h2>
            <p className="truncate text-sm text-muted-foreground">
              Shared repository views backed by GitDB.
            </p>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <label className="relative min-w-64">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              aria-label="Search views"
              className="h-9 w-full rounded-md border border-border bg-popover pl-9 pr-3 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              onChange={(event) => setSearchText(event.currentTarget.value)}
              placeholder="Search views"
              value={searchText}
            />
          </label>
          <Button
            disabled={!repositoryId || createSavedView.isPending}
            leftIcon={<Plus aria-hidden className="size-4" />}
            loading={createSavedView.isPending}
            loadingLabel="Creating view"
            onClick={createView}
            size="sm"
            variant="outline"
          >
            New view
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-card">
        <table className="w-full min-w-[960px] border-collapse text-left">
          <thead className="border-b border-border bg-subtle/70 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Layout</th>
              <th className="px-4 py-3">
                <span className="inline-flex items-center gap-1.5">
                  <ListFilter aria-hidden className="size-3.5" />
                  Filters
                </span>
              </th>
              <th className="px-4 py-3">Scope</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3 text-right">Updated</th>
            </tr>
          </thead>
          <tbody className={cn("divide-y divide-border/0", views.length === 0 && "divide-y-0")}>
            {renderBody()}
          </tbody>
        </table>
      </div>
    </section>
  );
};
