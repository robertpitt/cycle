import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../lib/cn.ts";
import { normalizeTone, type ComponentTone } from "../../lib/contracts.ts";
export const issueMetaChipVariants = cva(
  "inline-flex h-7 min-w-0 items-center gap-2 rounded-full border px-2.5 text-sm font-medium",
  {
    defaultVariants: {
      tone: "neutral",
    },
    variants: {
      tone: {
        accent: "border-accent/25 bg-accent/8 text-accent",
        danger: "border-destructive/25 bg-destructive/8 text-destructive",
        info: "border-primary/25 bg-primary/8 text-primary",
        neutral: "border-border bg-popover text-muted-foreground",
        success: "border-success/25 bg-success/8 text-success",
        warning: "border-warning/25 bg-warning/8 text-warning",
      },
    },
  },
);
export type IssueMetaChipProps = React.HTMLAttributes<HTMLSpanElement> &
  Omit<VariantProps<typeof issueMetaChipVariants>, "tone"> & {
    readonly icon?: React.ReactNode;
    readonly label: React.ReactNode;
    readonly tone?: ComponentTone | "destructive";
  };
export const IssueMetaChip = React.forwardRef<HTMLSpanElement, IssueMetaChipProps>(
  function IssueMetaChip({ className, icon, label, tone, ...props }, ref) {
    const resolvedTone = normalizeTone(tone) ?? "neutral";
    return (
      <span
        {...props}
        ref={ref}
        className={cn(
          issueMetaChipVariants({
            tone: resolvedTone,
          }),
          className,
        )}
        data-tone={resolvedTone}
      >
        {icon ? <span className="grid size-3.5 shrink-0 place-items-center">{icon}</span> : null}
        <span className="truncate">{label}</span>
      </span>
    );
  },
);
