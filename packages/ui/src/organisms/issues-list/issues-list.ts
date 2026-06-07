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
  readonly headerAction?: React.ReactNode;
  readonly loading?: boolean;
  readonly loadingRowCount?: number;
  readonly count?: React.ReactNode;
  readonly onCreateIssue?: React.MouseEventHandler<HTMLButtonElement>;
  readonly onRowSelect?: (id: string) => void;
  readonly rowMetaLimit?: number;
  readonly rows: readonly IssueListRowProps[];
  readonly selectedRowId?: string;
  readonly title: React.ReactNode;
};

export const IssuesList = React.forwardRef<HTMLDivElement, IssuesListProps>(function IssuesList(
  {
    className,
    count,
    density = "comfortable",
    emptyState,
    error,
    headerAction,
    loading = false,
    loadingRowCount = 6,
    onCreateIssue,
    onRowSelect,
    rowMetaLimit,
    rows,
    selectedRowId,
    title,
    ...props
  },
  ref,
) {
  const hasRows = rows.length > 0;

  return React.createElement(
    "div",
    {
      ...props,
      ref,
      className: cn("min-w-0 bg-surface", className),
      "data-state": loading ? "loading" : error ? "error" : hasRows ? "ready" : "empty",
    },
    React.createElement(IssueGroupHeader, {
      action: headerAction,
      count,
      onAction: onCreateIssue,
      title,
    }),
    React.createElement(
      "div",
      { className: "min-w-[980px]" },
      loading
        ? Array.from({ length: loadingRowCount }, (_, index) =>
            React.createElement(
              "div",
              {
                className:
                  "grid min-h-12 grid-cols-[28px_86px_minmax(220px,1fr)_minmax(260px,0.9fr)_68px_40px] items-center gap-3 border-b border-border px-7 last:border-b-0",
                key: index,
              },
              React.createElement(Skeleton, { className: "h-4 w-1 rounded-full" }),
              React.createElement(Skeleton, { className: "h-4 w-16" }),
              React.createElement(Skeleton, { className: "h-4 w-3/4" }),
              React.createElement(Skeleton, {
                className: "h-7 w-48 justify-self-end rounded-full",
              }),
              React.createElement(Skeleton, { className: "h-4 w-12 justify-self-end" }),
              React.createElement(Skeleton, { className: "size-6 justify-self-end rounded-full" }),
            ),
          )
        : error
          ? React.createElement(
              "div",
              {
                className:
                  "grid min-h-32 place-items-center px-7 py-10 text-center text-sm text-destructive",
                role: "alert",
              },
              error,
            )
          : hasRows
            ? rows.map((row) =>
                React.createElement(IssueListRow, {
                  ...row,
                  density: row.density ?? density,
                  key: row.id,
                  metaLimit: row.metaLimit ?? rowMetaLimit,
                  onSelect: row.onSelect ?? onRowSelect,
                  selected: row.selected ?? row.id === selectedRowId,
                }),
              )
            : React.createElement(
                "div",
                {
                  className:
                    "grid min-h-32 place-items-center px-7 py-10 text-center text-sm text-muted-foreground",
                  role: "status",
                },
                emptyState ?? "No issues to display.",
              ),
    ),
  );
});
