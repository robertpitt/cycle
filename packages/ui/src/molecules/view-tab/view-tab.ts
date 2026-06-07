import * as React from "react";

import { cn } from "../../lib/cn.ts";
import { focusRing } from "../../lib/styles.ts";

export type ViewTabProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly active?: boolean;
  readonly controls?: string;
  readonly count?: React.ReactNode;
  readonly icon?: React.ReactNode;
  readonly label: React.ReactNode;
  readonly selected?: boolean;
  readonly value?: string;
};

export const ViewTab = React.forwardRef<HTMLButtonElement, ViewTabProps>(function ViewTab(
  { active, className, controls, count, icon, label, selected, value, ...props },
  ref,
) {
  const isSelected = selected ?? active ?? false;

  return React.createElement(
    "button",
    {
      ...props,
      ref,
      "aria-controls": controls,
      "aria-selected": isSelected,
      className: cn(
        "inline-flex h-8 min-w-0 items-center gap-2 rounded-md border border-border bg-popover px-3 text-sm font-medium text-muted-foreground shadow-sm transition-colors hover:bg-subtle hover:text-foreground",
        focusRing,
        isSelected && "bg-subtle text-foreground shadow-card",
        className,
      ),
      "data-state": isSelected ? "active" : "inactive",
      "data-value": value,
      role: props.role ?? "tab",
      tabIndex: props.tabIndex ?? (isSelected ? 0 : -1),
      type: "button",
    },
    icon
      ? React.createElement("span", { className: "grid size-4 shrink-0 place-items-center" }, icon)
      : null,
    React.createElement("span", { className: "truncate" }, label),
    count !== undefined && count !== null
      ? React.createElement("span", { className: "text-xs text-muted-foreground" }, count)
      : null,
  );
});
