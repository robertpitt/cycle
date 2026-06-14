import {
  AlertTriangle,
  Archive,
  AtSign,
  CheckCheck,
  Inbox,
  MessageCircle,
  UserRoundCheck,
} from "lucide-react";
import * as React from "react";
import { Badge } from "../../atoms/badge/index.ts";
import { Checkbox } from "../../atoms/checkbox/index.ts";
import { DateTime } from "../../atoms/date-time/index.ts";
import { IconButton } from "../../atoms/icon-button/index.ts";
import { Select } from "../../atoms/select/index.ts";
import { Skeleton } from "../../atoms/skeleton/index.ts";
import { cn } from "../../lib/cn.ts";

export type InboxListReason = "assigned" | "comment_assigned" | "comment_created" | "mention";
export type InboxListStatus = "archived" | "read" | "snoozed" | "unread";
export type InboxListSourceState = "active" | "source_archived" | "source_deleted";

export type InboxListEntry = {
  readonly actor?: {
    readonly email?: string;
    readonly name?: string;
  };
  readonly bodyExcerpt?: string;
  readonly createdAt: string;
  readonly itemId: string;
  readonly reason: InboxListReason;
  readonly recordId?: string;
  readonly repositoryId: string;
  readonly sourceState?: InboxListSourceState;
  readonly status: InboxListStatus;
  readonly ticketId: string;
  readonly title: string;
};

export type InboxListRepository = {
  readonly label?: string;
  readonly repositoryId: string;
  readonly status?: string;
  readonly warningCount?: number;
};

export type InboxListProps = Omit<React.HTMLAttributes<HTMLDivElement>, "title"> & {
  readonly count?: React.ReactNode;
  readonly entries: readonly InboxListEntry[];
  readonly loading?: boolean;
  readonly onArchiveSelected?: (itemIds: readonly string[]) => void;
  readonly onEntrySelect?: (entry: InboxListEntry) => void;
  readonly onReasonFilterChange?: (reason: InboxListReason | "all") => void;
  readonly onRepositoryFilterChange?: (repositoryId: string | "all") => void;
  readonly onSelectionChange?: (itemIds: readonly string[]) => void;
  readonly onStatusFilterChange?: (status: InboxListStatus | "all") => void;
  readonly onMarkSelectedRead?: (itemIds: readonly string[]) => void;
  readonly reasonFilter?: InboxListReason | "all";
  readonly repositories?: readonly InboxListRepository[];
  readonly repositoryFilter?: string | "all";
  readonly selectedItemIds?: readonly string[];
  readonly statusFilter?: InboxListStatus | "all";
  readonly title?: React.ReactNode;
};

const reasonLabels = {
  assigned: "Assigned",
  comment_assigned: "Assigned comment",
  comment_created: "Creator comment",
  mention: "Mention",
} satisfies Record<InboxListReason, string>;

const statusLabels = {
  archived: "Archived",
  read: "Read",
  snoozed: "Snoozed",
  unread: "Unread",
} satisfies Record<InboxListStatus, string>;

const reasonIcons = {
  assigned: UserRoundCheck,
  comment_assigned: MessageCircle,
  comment_created: MessageCircle,
  mention: AtSign,
} satisfies Record<InboxListReason, typeof AtSign>;

const loadingRows = () =>
  Array.from({ length: 6 }, (_, index) => (
    <div
      className="grid min-h-14 grid-cols-[20px_28px_minmax(180px,1fr)_150px_108px_88px] items-center gap-3 border-b border-border px-5 last:border-b-0"
      key={index}
    >
      <Skeleton className="size-4" />
      <Skeleton className="size-6 rounded-full" />
      <div className="grid gap-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-5 w-28" />
      <Skeleton className="h-5 w-20" />
      <Skeleton className="h-4 w-16 justify-self-end" />
    </div>
  ));

export const InboxList = React.forwardRef<HTMLDivElement, InboxListProps>(function InboxList(
  {
    className,
    count,
    entries,
    loading = false,
    onArchiveSelected,
    onEntrySelect,
    onMarkSelectedRead,
    onReasonFilterChange,
    onRepositoryFilterChange,
    onSelectionChange,
    onStatusFilterChange,
    reasonFilter = "all",
    repositories = [],
    repositoryFilter = "all",
    selectedItemIds,
    statusFilter = "unread",
    title = "Inbox",
    ...props
  },
  ref,
) {
  const [internalSelection, setInternalSelection] = React.useState<readonly string[]>([]);
  const selected = selectedItemIds ?? internalSelection;
  const selectedSet = React.useMemo(() => new Set(selected), [selected]);
  const degraded = repositories.filter(
    (repository) =>
      repository.status === "degraded" ||
      repository.status === "failed" ||
      (repository.warningCount ?? 0) > 0,
  );
  const allVisibleSelected =
    entries.length > 0 && entries.every((entry) => selectedSet.has(entry.itemId));

  const updateSelection = (itemIds: readonly string[]) => {
    if (selectedItemIds === undefined) setInternalSelection(itemIds);
    onSelectionChange?.(itemIds);
  };

  const toggleAll = () => {
    updateSelection(allVisibleSelected ? [] : entries.map((entry) => entry.itemId));
  };

  const toggleOne = (itemId: string) => {
    updateSelection(
      selectedSet.has(itemId)
        ? selected.filter((selectedItemId) => selectedItemId !== itemId)
        : [...selected, itemId],
    );
  };

  return (
    <div
      {...props}
      ref={ref}
      className={cn("flex min-h-0 min-w-0 flex-col bg-surface text-foreground", className)}
      data-state={loading ? "loading" : entries.length === 0 ? "empty" : "ready"}
    >
      <div className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-subtle text-muted-foreground">
            <Inbox aria-hidden className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{title}</h2>
            {count === undefined ? null : (
              <div className="text-sm text-muted-foreground">{count}</div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Select
            aria-label="Repository"
            className="w-[148px]"
            items={[
              { label: "All repositories", value: "all" },
              ...repositories.map((repository) => ({
                label: repository.label ?? repository.repositoryId,
                value: repository.repositoryId,
              })),
            ]}
            onValueChange={(value) => {
              if (value !== null) onRepositoryFilterChange?.(value);
            }}
            value={repositoryFilter}
          />
          <Select
            aria-label="Reason"
            className="w-[132px]"
            items={[
              { label: "All reasons", value: "all" },
              ...Object.entries(reasonLabels).map(([value, label]) => ({ label, value })),
            ]}
            onValueChange={(value) => {
              if (value !== null) onReasonFilterChange?.(value as InboxListReason | "all");
            }}
            value={reasonFilter}
          />
          <Select
            aria-label="Status"
            className="w-[112px]"
            items={[
              { label: "All status", value: "all" },
              ...Object.entries(statusLabels).map(([value, label]) => ({ label, value })),
            ]}
            onValueChange={(value) => {
              if (value !== null) onStatusFilterChange?.(value as InboxListStatus | "all");
            }}
            value={statusFilter}
          />
          <IconButton
            disabled={selected.length === 0}
            icon={<CheckCheck aria-hidden className="size-4" />}
            label="Mark read"
            onClick={() => onMarkSelectedRead?.(selected)}
            size="sm"
            title="Mark read"
            variant="outline"
          />
          <IconButton
            disabled={selected.length === 0}
            icon={<Archive aria-hidden className="size-4" />}
            label="Archive"
            onClick={() => onArchiveSelected?.(selected)}
            size="sm"
            title="Archive"
            variant="outline"
          />
        </div>
      </div>

      {degraded.length > 0 ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-warning/20 bg-warning/8 px-5 py-2 text-sm text-warning">
          <AlertTriangle aria-hidden className="size-4 shrink-0" />
          <span className="truncate">
            Projection warnings in{" "}
            {degraded.map((repository) => repository.label ?? repository.repositoryId).join(", ")}
          </span>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="min-w-[860px]">
          <div className="grid h-9 grid-cols-[20px_28px_minmax(180px,1fr)_150px_108px_88px] items-center gap-3 border-b border-border bg-subtle/55 px-5 text-xs font-medium uppercase text-muted-foreground">
            <Checkbox
              aria-label="Select visible inbox items"
              checked={allVisibleSelected}
              disabled={entries.length === 0}
              onCheckedChange={toggleAll}
            />
            <span />
            <span>Item</span>
            <span>Reason</span>
            <span>Status</span>
            <span className="text-right">Time</span>
          </div>

          {loading ? (
            loadingRows()
          ) : entries.length === 0 ? (
            <div
              className="grid min-h-40 place-items-center px-6 py-10 text-center text-sm text-muted-foreground"
              role="status"
            >
              Inbox clear
            </div>
          ) : (
            entries.map((entry) => (
              <InboxRow
                entry={entry}
                key={entry.itemId}
                onSelect={onEntrySelect}
                onToggle={toggleOne}
                selected={selectedSet.has(entry.itemId)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
});

const InboxRow = ({
  entry,
  onSelect,
  onToggle,
  selected,
}: {
  readonly entry: InboxListEntry;
  readonly onSelect?: (entry: InboxListEntry) => void;
  readonly onToggle: (itemId: string) => void;
  readonly selected: boolean;
}) => {
  const Icon = reasonIcons[entry.reason];
  const muted = entry.status !== "unread";
  const inactive =
    entry.sourceState === "source_archived" || entry.sourceState === "source_deleted";

  return (
    <div
      className={cn(
        "group grid min-h-14 grid-cols-[20px_28px_minmax(180px,1fr)_150px_108px_88px] items-center gap-3 border-b border-border px-5 last:border-b-0",
        "transition-colors hover:bg-subtle/70",
        selected && "bg-primary/5",
        muted && "text-muted-foreground",
      )}
    >
      <Checkbox
        aria-label={`Select ${entry.ticketId}`}
        checked={selected}
        onCheckedChange={() => onToggle(entry.itemId)}
      />
      <span className="grid size-7 place-items-center rounded-md bg-subtle text-muted-foreground">
        <Icon aria-hidden className="size-4" />
      </span>
      <button
        className="min-w-0 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        onClick={() => onSelect?.(entry)}
        type="button"
      >
        <span className="block truncate text-sm font-medium text-foreground">{entry.title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {entry.ticketId}
          {entry.bodyExcerpt ? ` · ${entry.bodyExcerpt}` : ""}
        </span>
      </button>
      <span className="truncate text-sm text-muted-foreground">{reasonLabels[entry.reason]}</span>
      <span className="flex min-w-0 items-center gap-2">
        <Badge
          appearance={entry.status === "unread" ? "solid" : "outline"}
          tone={entry.status === "unread" ? "info" : inactive ? "warning" : "neutral"}
        >
          {inactive ? "Inactive" : statusLabels[entry.status]}
        </Badge>
      </span>
      <span className="truncate text-right text-xs text-muted-foreground">
        <DateTime fallback={entry.createdAt} format="compactDateTime" value={entry.createdAt} />
      </span>
    </div>
  );
};
