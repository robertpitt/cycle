import * as React from "react";
import { cn } from "../../lib/cn.ts";

export type ShellSidebarSectionProps = React.HTMLAttributes<HTMLElement> & {
  readonly action?: React.ReactNode;
  readonly collapsed?: boolean;
  readonly title: React.ReactNode;
};

export const ShellSidebarSection = React.forwardRef<HTMLElement, ShellSidebarSectionProps>(
  function ShellSidebarSection(
    { action, children, className, collapsed = false, title, ...props },
    ref,
  ) {
    return (
      <section {...props} ref={ref} className={cn("grid gap-2", className)}>
        <div
          className={cn("flex h-6 items-center justify-between gap-2 px-2", collapsed && "sr-only")}
        >
          <h2 className="truncate text-[11px] font-semibold uppercase text-muted-foreground">
            {title}
          </h2>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        {children}
      </section>
    );
  },
);
