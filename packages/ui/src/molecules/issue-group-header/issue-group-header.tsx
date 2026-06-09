import { Plus } from "lucide-react";
import * as React from "react";
import { IconButton } from "../../atoms/icon-button/index.ts";
import { StatusIndicator, type StatusIndicatorProps } from "../../atoms/status-indicator/index.ts";
import { cn } from "../../lib/cn.ts";
export type IssueGroupHeaderProps = Omit<React.HTMLAttributes<HTMLDivElement>, "title"> & {
  readonly action?: React.ReactNode;
  readonly actionLabel?: string;
  readonly count?: React.ReactNode;
  readonly onAction?: React.MouseEventHandler<HTMLButtonElement>;
  readonly statusTone?: StatusIndicatorProps["tone"];
  readonly title: React.ReactNode;
};
export const IssueGroupHeader = React.forwardRef<HTMLDivElement, IssueGroupHeaderProps>(
  function IssueGroupHeader(
    {
      action,
      actionLabel = "Create issue",
      className,
      count,
      onAction,
      statusTone = "success",
      title,
      ...props
    },
    ref,
  ) {
    return (
      <div
        {...props}
        ref={ref}
        className={cn(
          "flex h-12 items-center gap-3 border-b border-border bg-subtle/55 px-7 text-sm",
          className,
        )}
      >
        <StatusIndicator label={String(title)} shape="ring" tone={statusTone} />
        <span className="text-base font-semibold text-foreground">{title}</span>
        {count !== undefined && count !== null ? (
          <span className="text-sm text-muted-foreground">{count}</span>
        ) : null}
        {action ?? (
          <IconButton
            className="ml-auto"
            icon={<Plus aria-hidden className="size-4" />}
            label={actionLabel}
            onClick={onAction}
            size="sm"
          />
        )}
      </div>
    );
  },
);
