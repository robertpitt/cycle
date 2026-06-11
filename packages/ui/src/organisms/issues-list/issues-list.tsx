import { ChevronDown } from "lucide-react";
import * as React from "react";
import { Skeleton } from "../../atoms/skeleton/index.ts";
import { cn } from "../../lib/cn.ts";
import type { ComponentDensity } from "../../lib/contracts.ts";
import { IssueGroupHeader } from "../../molecules/issue-group-header/index.ts";
import { IssueListRow, type IssueListRowProps } from "../../molecules/issue-list-row/index.ts";
export type IssuesListProps = Omit<React.HTMLAttributes<HTMLDivElement>, "title"> & {
  readonly density?: ComponentDensity;
  readonly emptyState?: React.ReactNode;
  readonly error?: React.ReactNode;
  readonly groups?: readonly IssuesListGroup[];
  readonly headerAction?: React.ReactNode;
  readonly headerClassName?: string;
  readonly loading?: boolean;
  readonly loadingRowCount?: number;
  readonly count?: React.ReactNode;
  readonly onCreateIssue?: React.MouseEventHandler<HTMLButtonElement>;
  readonly onRowSelect?: (id: string) => void;
  readonly rowMetaLimit?: number;
  readonly rowsClassName?: string;
  readonly rows: readonly IssueListRowProps[];
  readonly selectedRowId?: string;
  readonly showHeader?: boolean;
  readonly title: React.ReactNode;
};

export type IssuesListGroup = {
  readonly action?: React.ReactNode;
  readonly collapsed?: boolean;
  readonly count?: React.ReactNode;
  readonly icon?: React.ReactNode;
  readonly id: string;
  readonly onToggle?: (group: IssuesListGroup) => void;
  readonly rows: readonly IssueListRowProps[];
  readonly title: React.ReactNode;
};

const loadingRows = (count: number) =>
  Array.from(
    {
      length: count,
    },
    (_, index) => (
      <div
        className="grid min-h-12 grid-cols-[28px_86px_28px_minmax(220px,1fr)_minmax(180px,0.75fr)_68px_40px] items-center gap-2 border-b border-border px-5 last:border-b-0"
        key={index}
      >
        <Skeleton className="size-4" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="size-4 rounded-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-7 w-44 justify-self-end rounded-full" />
        <Skeleton className="h-4 w-12 justify-self-end" />
        <Skeleton className="size-6 justify-self-end rounded-full" />
      </div>
    ),
  );

const IssuesListGroupHeader = ({ group }: { readonly group: IssuesListGroup }) => {
  const collapsed = group.collapsed ?? false;

  return (
    <div className="group flex h-11 items-center gap-3 rounded-md border border-border bg-subtle/70 px-3 text-sm shadow-card">
      <button
        aria-expanded={!collapsed}
        className="flex min-w-0 flex-1 items-center gap-3 rounded text-left text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        onClick={() => group.onToggle?.(group)}
        type="button"
      >
        <ChevronDown
          aria-hidden
          className={cn("size-3.5 shrink-0 transition-transform", collapsed && "-rotate-90")}
          strokeWidth={2}
        />
        {group.icon ? (
          <span className="grid size-5 shrink-0 place-items-center text-muted-foreground">
            {group.icon}
          </span>
        ) : null}
        <span className="min-w-0 truncate text-base font-semibold text-foreground">
          {group.title}
        </span>
        {group.count !== undefined && group.count !== null ? (
          <span className="text-sm font-medium text-muted-foreground">{group.count}</span>
        ) : null}
      </button>
      {group.action}
    </div>
  );
};

export const IssuesList = React.forwardRef<HTMLDivElement, IssuesListProps>(function IssuesList(
  {
    className,
    count,
    density = "comfortable",
    emptyState,
    error,
    groups,
    headerAction,
    headerClassName,
    loading = false,
    loadingRowCount = 6,
    onCreateIssue,
    onRowSelect,
    rowMetaLimit,
    rowsClassName,
    rows,
    selectedRowId,
    showHeader = true,
    title,
    ...props
  },
  ref,
) {
  const hasRows = rows.length > 0;
  const hasGroups = groups !== undefined && groups.length > 0;
  const renderRows = (nextRows: readonly IssueListRowProps[]) =>
    nextRows.map((row) => (
      <IssueListRow
        {...row}
        density={row.density ?? density}
        key={row.id}
        metaLimit={row.metaLimit ?? rowMetaLimit}
        onSelect={row.onSelect ?? onRowSelect}
        selected={row.selected ?? row.id === selectedRowId}
      />
    ));

  return (
    <div
      {...props}
      ref={ref}
      className={cn("min-w-0 bg-surface", className)}
      data-state={
        loading ? "loading" : error ? "error" : hasRows || hasGroups ? "ready" : "empty"
      }
    >
      {showHeader ? (
        <IssueGroupHeader
          action={headerAction}
          className={headerClassName}
          count={count}
          onAction={onCreateIssue}
          title={title}
        />
      ) : null}
      <div className={cn("min-w-[980px]", rowsClassName)}>
        {loading ? (
          loadingRows(loadingRowCount)
        ) : error ? (
          <div
            className="grid min-h-32 place-items-center px-7 py-10 text-center text-sm text-destructive"
            role="alert"
          >
            {error}
          </div>
        ) : hasGroups ? (
          <div className="grid gap-1">
            {groups.map((group) => (
              <section className="grid gap-1" key={group.id}>
                <IssuesListGroupHeader group={group} />
                {group.collapsed ? null : renderRows(group.rows)}
              </section>
            ))}
          </div>
        ) : hasRows ? (
          renderRows(rows)
        ) : (
          <div
            className="grid min-h-32 place-items-center px-7 py-10 text-center text-sm text-muted-foreground"
            role="status"
          >
            {emptyState ?? "No issues to display."}
          </div>
        )}
      </div>
    </div>
  );
});
