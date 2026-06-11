import { Clock3 } from "lucide-react";
import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "../../atoms/avatar/index.ts";
import { StatusIndicator, type StatusIndicatorProps } from "../../atoms/status-indicator/index.ts";
import { cn } from "../../lib/cn.ts";
import type { ComponentDensity } from "../../lib/contracts.ts";
import { focusRing } from "../../lib/styles.ts";
import { IssueMetaChip, type IssueMetaChipProps } from "../issue-meta-chip/index.ts";
export type IssueListRowMeta = Pick<IssueMetaChipProps, "icon" | "label" | "tone">;
export type IssueListRowProps = Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect" | "title"> & {
  readonly assigneeControl?: React.ReactNode;
  readonly assigneeImage?: string;
  readonly assigneeInitials?: string;
  readonly date?: React.ReactNode;
  readonly density?: ComponentDensity;
  readonly disabled?: boolean;
  readonly id: string;
  readonly meta?: readonly IssueListRowMeta[];
  readonly metaLimit?: number;
  readonly onSelect?: (id: string) => void;
  readonly priorityControl?: React.ReactNode;
  readonly priorityTone?: StatusIndicatorProps["tone"];
  readonly selected?: boolean;
  readonly statusControl?: React.ReactNode;
  readonly statusTone?: StatusIndicatorProps["tone"];
  readonly title: React.ReactNode;
  readonly updateCount?: React.ReactNode;
};
const densityClassName = {
  compact: "min-h-10",
  comfortable: "min-h-12",
} satisfies Record<ComponentDensity, string>;
export const IssueListRow = React.forwardRef<HTMLDivElement, IssueListRowProps>(
  function IssueListRow(
    {
      assigneeControl,
      assigneeImage,
      assigneeInitials,
      className,
      date,
      density = "comfortable",
      disabled = false,
      id,
      meta = [],
      metaLimit = 3,
      onClick,
      onKeyDown,
      onSelect,
      priorityControl,
      priorityTone = "neutral",
      selected = false,
      statusControl,
      statusTone = "success",
      title,
      updateCount,
      ...props
    },
    ref,
  ) {
    const isInteractive = Boolean(onClick || onSelect);
    const visibleMeta = meta.slice(0, metaLimit);
    const hiddenMetaCount = Math.max(meta.length - visibleMeta.length, 0);
    const selectRow = () => {
      if (!disabled) {
        onSelect?.(id);
      }
    };
    return (
      <div
        {...props}
        ref={ref}
        aria-disabled={disabled ? true : undefined}
        aria-selected={selected || undefined}
        className={cn(
          "grid grid-cols-[28px_86px_28px_minmax(220px,1fr)_minmax(180px,0.75fr)_68px_40px] items-center gap-2 border-b border-border px-5 text-sm last:border-b-0 hover:bg-subtle/45",
          densityClassName[density],
          isInteractive && focusRing,
          selected && "bg-subtle/70",
          disabled && "pointer-events-none cursor-not-allowed opacity-45",
          className,
        )}
        data-density={density}
        data-state={selected ? "selected" : "idle"}
        onClick={(event: React.MouseEvent<HTMLDivElement>) => {
          onClick?.(event);
          if (!event.defaultPrevented) {
            selectRow();
          }
        }}
        onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
          onKeyDown?.(event);
          if (
            !event.defaultPrevented &&
            isInteractive &&
            (event.key === "Enter" || event.key === " ")
          ) {
            event.preventDefault();
            selectRow();
          }
        }}
        role={props.role ?? (isInteractive ? "button" : undefined)}
        tabIndex={props.tabIndex ?? (isInteractive && !disabled ? 0 : undefined)}
      >
        <span className="grid size-7 place-items-center justify-self-start">
          {priorityControl ?? (
            <StatusIndicator label="Priority" shape="bar" tone={priorityTone} />
          )}
        </span>
        <span className="min-w-0 truncate font-medium text-muted-foreground" title={id}>
          {id}
        </span>
        <span className="grid size-7 place-items-center justify-self-start">
          {statusControl ?? (
            <StatusIndicator label="Issue status" shape="ring" tone={statusTone} />
          )}
        </span>
        <span className="min-w-0 truncate font-semibold text-foreground">{title}</span>
        <div className="flex min-w-0 items-center justify-end gap-1.5 overflow-hidden">
          {visibleMeta.map((item, index) => (
            <IssueMetaChip
              {...item}
              className="max-w-[190px]"
              key={`${String(item.label)}-${index}`}
            />
          ))}
          {hiddenMetaCount > 0 ? (
            <span
              className="inline-flex h-7 items-center rounded-full border border-border bg-popover px-2 text-sm text-muted-foreground"
              title={`${hiddenMetaCount} more metadata item${hiddenMetaCount === 1 ? "" : "s"}`}
            >{`+${hiddenMetaCount}`}</span>
          ) : null}
          {updateCount ? (
            <span className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-popover px-2 text-sm text-muted-foreground">
              <Clock3 aria-hidden className="size-3.5" />
              {updateCount}
            </span>
          ) : null}
        </div>
        <span className="justify-self-end text-muted-foreground">{date}</span>
        <span className="grid size-7 place-items-center justify-self-end">
          {assigneeControl ?? (
            <Avatar className="size-6">
              {assigneeImage ? <AvatarImage alt="" src={assigneeImage} /> : null}
              <AvatarFallback className="text-[10px]">{assigneeInitials ?? ""}</AvatarFallback>
            </Avatar>
          )}
        </span>
      </div>
    );
  },
);
