import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../lib/cn.ts";
import type { ComponentTone } from "../../lib/contracts.ts";
export const statusIndicatorVariants = cva("inline-flex shrink-0", {
  defaultVariants: {
    shape: "dot",
    tone: "neutral",
  },
  variants: {
    shape: {
      bar: "h-4 w-1 rounded-full",
      dot: "size-2 rounded-full",
      ring: "size-3 rounded-full border-2 bg-transparent",
    },
    tone: {
      accent: "bg-accent border-accent text-accent",
      danger: "bg-destructive border-destructive text-destructive",
      info: "bg-primary border-primary text-primary",
      neutral: "bg-muted-foreground border-muted-foreground text-muted-foreground",
      success: "bg-success border-success text-success",
      warning: "bg-warning border-warning text-warning",
    },
  },
});
export type StatusIndicatorProps = React.HTMLAttributes<HTMLSpanElement> &
  Omit<VariantProps<typeof statusIndicatorVariants>, "tone"> & {
    readonly label?: string;
    readonly tone?: ComponentTone;
  };
export const StatusIndicator = React.forwardRef<HTMLSpanElement, StatusIndicatorProps>(
  function StatusIndicator({ className, label, shape, tone, ...props }, ref) {
    const resolvedTone = tone ?? "neutral";
    return (
      <span
        {...props}
        ref={ref}
        aria-label={label}
        aria-hidden={label ? undefined : true}
        className={cn(
          statusIndicatorVariants({
            shape,
            tone: resolvedTone,
          }),
          className,
        )}
        data-tone={resolvedTone}
        role={label ? "img" : undefined}
      />
    );
  },
);
