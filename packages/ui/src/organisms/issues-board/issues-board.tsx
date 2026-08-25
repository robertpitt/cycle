import * as React from "react";
import { Skeleton } from "../../atoms/skeleton/index.ts";
import { IssueMetaChip } from "../../molecules/issue-meta-chip/index.ts";
import type { IssueListRowProps } from "../../molecules/issue-list-row/index.ts";
import { cn } from "../../lib/cn.ts";
import { focusRing } from "../../lib/styles.ts";

export type IssuesBoardColumn = {
  readonly count?: React.ReactNode;
  readonly icon?: React.ReactNode;
  readonly id: string;
  readonly rows: readonly IssueListRowProps[];
  readonly title: React.ReactNode;
};

export type IssuesBoardProps = React.HTMLAttributes<HTMLDivElement> & {
  readonly columns: readonly IssuesBoardColumn[];
  readonly emptyState?: React.ReactNode;
  readonly error?: React.ReactNode;
  readonly loading?: boolean;
  readonly onRowSelect?: (id: string) => void;
  readonly selectedRowId?: string;
};

const BoardCard = ({
  onSelect,
  row,
  selected,
}: {
  readonly onSelect?: (id: string) => void;
  readonly row: IssueListRowProps;
  readonly selected: boolean;
}) => {
  const select = () => onSelect?.(row.id);

  return (
    <div
      aria-pressed={selected}
      className={cn(
        "grid cursor-pointer gap-3 rounded-md border border-border bg-surface p-3 shadow-card transition hover:border-ring/40 hover:bg-subtle/35",
        focusRing,
        selected && "border-ring bg-subtle/60",
      )}
      onClick={select}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          select();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-xs font-medium text-muted-foreground">{row.id}</span>
        <div className="flex items-center gap-1">
          {row.priorityControl}
          {row.statusControl}
          {row.assigneeControl}
        </div>
      </div>
      <div className="text-sm font-semibold leading-5 text-foreground">{row.title}</div>
      {(row.meta?.length ?? 0) > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {row.meta?.slice(0, row.metaLimit ?? 3).map((meta, index) => (
            <IssueMetaChip {...meta} key={`${String(meta.label)}-${index}`} />
          ))}
        </div>
      ) : null}
      {row.date ? <div className="text-xs text-muted-foreground">Updated {row.date}</div> : null}
    </div>
  );
};

export const IssuesBoard = React.forwardRef<HTMLDivElement, IssuesBoardProps>(function IssuesBoard(
  {
    className,
    columns,
    emptyState = "No issues to display.",
    error,
    loading = false,
    onRowSelect,
    selectedRowId,
    ...props
  },
  ref,
) {
  if (loading) {
    return (
      <div className="grid min-h-48 grid-cols-3 gap-3" role="status">
        {[0, 1, 2].map((column) => (
          <Skeleton className="h-64 rounded-lg" key={column} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid min-h-48 place-items-center text-sm text-destructive" role="alert">
        {error}
      </div>
    );
  }

  if (columns.length === 0) {
    return (
      <div className="grid min-h-48 place-items-center text-sm text-muted-foreground" role="status">
        {emptyState}
      </div>
    );
  }

  return (
    <div {...props} ref={ref} className={cn("flex min-w-0 gap-3 overflow-x-auto pb-3", className)}>
      {columns.map((column) => (
        <section
          aria-labelledby={`cycle-board-column-${column.id}`}
          className="grid w-[300px] shrink-0 content-start gap-2 rounded-lg bg-subtle/45 p-2"
          key={column.id}
        >
          <header className="flex min-h-9 items-center gap-2 px-1">
            {column.icon ? (
              <span className="grid size-5 place-items-center text-muted-foreground">
                {column.icon}
              </span>
            ) : null}
            <h3
              className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground"
              id={`cycle-board-column-${column.id}`}
            >
              {column.title}
            </h3>
            <span className="text-xs font-medium text-muted-foreground">
              {column.count ?? column.rows.length}
            </span>
          </header>
          <div className="grid gap-2">
            {column.rows.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                No issues
              </div>
            ) : (
              column.rows.map((row) => (
                <BoardCard
                  key={row.id}
                  onSelect={row.onSelect ?? onRowSelect}
                  row={row}
                  selected={row.selected ?? row.id === selectedRowId}
                />
              ))
            )}
          </div>
        </section>
      ))}
    </div>
  );
});
