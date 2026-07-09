import * as React from "react";
import { Avatar, AvatarFallback } from "../../atoms/avatar/index.ts";
import { Badge, type BadgeProps } from "../../atoms/badge/index.ts";
import { cn } from "../../lib/cn.ts";
import type { ComponentDensity } from "../../lib/contracts.ts";
import { focusRing } from "../../lib/styles.ts";
export type WorkItemPriority = "high" | "low" | "medium";
export type WorkItemRowProps = Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect"> & {
  readonly assigneeInitials: string;
  readonly density?: ComponentDensity;
  readonly disabled?: boolean;
  readonly id: string;
  readonly onSelect?: (id: string) => void;
  readonly priority: WorkItemPriority;
  readonly selected?: boolean;
  readonly status: string;
  readonly statusTone?: BadgeProps["tone"];
  readonly title: string;
};
const priorityClassName = {
  high: "bg-destructive",
  low: "bg-success",
  medium: "bg-warning",
} satisfies Record<WorkItemPriority, string>;
const densityClassName = {
  compact: "py-2",
  comfortable: "py-3",
} satisfies Record<ComponentDensity, string>;
export const WorkItemRow = React.forwardRef<HTMLDivElement, WorkItemRowProps>(function WorkItemRow(
  {
    assigneeInitials,
    className,
    density = "comfortable",
    disabled = false,
    id,
    onClick,
    onKeyDown,
    onSelect,
    priority,
    selected = false,
    status,
    statusTone = "neutral",
    title,
    ...props
  },
  ref,
) {
  const isInteractive = Boolean(onClick || onSelect);
  const resolvedRole = props.role ?? (isInteractive ? "button" : undefined);
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
      aria-pressed={resolvedRole === "button" ? selected : undefined}
      aria-selected={resolvedRole && resolvedRole !== "button" ? selected || undefined : undefined}
      className={cn(
        "grid grid-cols-[auto_88px_1fr_112px_40px] items-center gap-3 border-b border-border px-4 text-sm last:border-b-0 hover:bg-subtle/70",
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
          event.currentTarget.click();
        }
      }}
      role={resolvedRole}
      tabIndex={props.tabIndex ?? (isInteractive && !disabled ? 0 : undefined)}
    >
      <span aria-hidden className={cn("size-2.5 rounded-full", priorityClassName[priority])} />
      <span className="min-w-0 truncate text-muted-foreground" title={id}>
        {id}
      </span>
      <span className="truncate text-foreground" title={title}>
        {title}
      </span>
      <Badge appearance="outline" className="max-w-full truncate" title={status} tone={statusTone}>
        {status}
      </Badge>
      <Avatar className="size-6">
        <AvatarFallback className="text-[10px]">{assigneeInitials}</AvatarFallback>
      </Avatar>
    </div>
  );
});
