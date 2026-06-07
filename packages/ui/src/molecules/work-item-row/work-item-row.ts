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

  const selectRow = () => {
    if (!disabled) {
      onSelect?.(id);
    }
  };

  return React.createElement(
    "div",
    {
      ...props,
      ref,
      "aria-disabled": disabled ? true : undefined,
      "aria-selected": selected || undefined,
      className: cn(
        "grid grid-cols-[auto_88px_1fr_112px_40px] items-center gap-3 border-b border-border px-4 text-sm last:border-b-0 hover:bg-subtle/70",
        densityClassName[density],
        isInteractive && focusRing,
        selected && "bg-subtle/70",
        disabled && "pointer-events-none cursor-not-allowed opacity-45",
        className,
      ),
      "data-density": density,
      "data-state": selected ? "selected" : "idle",
      onClick: (event: React.MouseEvent<HTMLDivElement>) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          selectRow();
        }
      },
      onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
        onKeyDown?.(event);

        if (
          !event.defaultPrevented &&
          isInteractive &&
          (event.key === "Enter" || event.key === " ")
        ) {
          event.preventDefault();
          selectRow();
        }
      },
      role: props.role ?? (isInteractive ? "button" : undefined),
      tabIndex: props.tabIndex ?? (isInteractive && !disabled ? 0 : undefined),
    },
    React.createElement("span", {
      "aria-hidden": true,
      className: cn("size-2.5 rounded-full", priorityClassName[priority]),
    }),
    React.createElement("span", { className: "text-muted-foreground" }, id),
    React.createElement("span", { className: "truncate text-foreground" }, title),
    React.createElement(Badge, { appearance: "outline", tone: statusTone }, status),
    React.createElement(
      Avatar,
      { className: "size-6" },
      React.createElement(AvatarFallback, { className: "text-[10px]" }, assigneeInitials),
    ),
  );
});
