import * as React from "react";
import { cn } from "../../lib/cn.ts";
import { disabledControl, focusRing } from "../../lib/styles.ts";

export type ChipTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly active?: boolean;
  readonly icon?: React.ReactNode;
  readonly label: React.ReactNode;
  readonly open?: boolean;
};

export const ChipTrigger = React.forwardRef<HTMLButtonElement, ChipTriggerProps>(
  function ChipTrigger(
    { active = false, className, icon, label, open = false, type = "button", ...props },
    ref,
  ) {
    return (
      <button
        {...props}
        ref={ref}
        aria-expanded={open}
        className={cn(
          "inline-flex h-8 max-w-full shrink-0 items-center gap-2 rounded-full border border-border bg-subtle px-3 text-sm font-medium text-muted-foreground shadow-sm transition-[background-color,border-color,color,box-shadow,transform] hover:border-input hover:bg-muted hover:text-foreground active:translate-y-px",
          active && "border-input text-foreground",
          open && "border-input bg-muted text-foreground shadow-card",
          focusRing,
          disabledControl,
          className,
        )}
        type={type}
      >
        {icon ? <span className="grid size-4 shrink-0 place-items-center">{icon}</span> : null}
        <span className="min-w-0 truncate">{label}</span>
      </button>
    );
  },
);
