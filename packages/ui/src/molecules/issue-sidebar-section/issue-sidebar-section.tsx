import { ChevronDown, ChevronRight } from "lucide-react";
import * as React from "react";
import { cn } from "../../lib/cn.ts";
import { focusRing, typography } from "../../lib/styles.ts";

export type IssueSidebarSectionProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "defaultValue"
> & {
  readonly actions?: React.ReactNode;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly open?: boolean;
  readonly title: React.ReactNode;
};

export const IssueSidebarSection = React.forwardRef<HTMLDivElement, IssueSidebarSectionProps>(
  function IssueSidebarSection(
    { actions, children, className, defaultOpen = true, onOpenChange, open, title, ...props },
    ref,
  ) {
    const contentId = React.useId();
    const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
    const isControlled = open !== undefined;
    const currentOpen = isControlled ? open : uncontrolledOpen;

    const setOpen = React.useCallback(
      (nextOpen: boolean) => {
        if (!isControlled) {
          setUncontrolledOpen(nextOpen);
        }
        onOpenChange?.(nextOpen);
      },
      [isControlled, onOpenChange],
    );

    return (
      <section
        {...props}
        ref={ref}
        className={cn(
          "overflow-hidden rounded-lg border border-border bg-elevated text-elevated-foreground shadow-sm",
          className,
        )}
      >
        <div className="flex min-h-12 items-center justify-between gap-3 px-4">
          <button
            aria-controls={contentId}
            aria-expanded={currentOpen}
            className={cn(
              "inline-flex min-w-0 items-center gap-2 rounded-md text-left text-muted-foreground transition hover:text-foreground",
              focusRing,
              typography.panelTitle,
            )}
            onClick={() => setOpen(!currentOpen)}
            type="button"
          >
            <span className="truncate">{title}</span>
            {currentOpen ? (
              <ChevronDown aria-hidden className="size-4" />
            ) : (
              <ChevronRight aria-hidden className="size-4" />
            )}
          </button>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
        {currentOpen ? (
          <div className="grid gap-3 px-4 pb-4" id={contentId}>
            {children}
          </div>
        ) : null}
      </section>
    );
  },
);
