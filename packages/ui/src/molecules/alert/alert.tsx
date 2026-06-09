import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../lib/cn.ts";
import { normalizeTone, type ComponentTone } from "../../lib/contracts.ts";
export const alertVariants = cva("grid gap-1 rounded-md border px-4 py-3 text-sm shadow-card", {
  defaultVariants: {
    tone: "info",
  },
  variants: {
    tone: {
      accent: "border-accent/25 bg-accent/10 text-accent",
      danger: "border-destructive/25 bg-destructive/10 text-destructive",
      info: "border-border bg-elevated text-elevated-foreground",
      neutral: "border-border bg-elevated text-elevated-foreground",
      success: "border-success/25 bg-success/10 text-success",
      warning: "border-warning/25 bg-warning/10 text-warning",
    },
  },
});
export type AlertLegacyVariant = "destructive" | "info" | "success" | "warning";
export type AlertProps = React.HTMLAttributes<HTMLDivElement> &
  Omit<VariantProps<typeof alertVariants>, "tone"> & {
    readonly tone?: ComponentTone;
    /**
     * @deprecated Prefer `tone`. `variant` is retained for existing consumers.
     */
    readonly variant?: AlertLegacyVariant;
  };
export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { className, role, tone, variant, ...props },
  ref,
) {
  const resolvedTone = tone ?? normalizeTone(variant) ?? "info";
  return (
    <div
      {...props}
      ref={ref}
      className={cn(
        alertVariants({
          tone: resolvedTone,
        }),
        className,
      )}
      data-tone={resolvedTone}
      role={role ?? (resolvedTone === "danger" ? "alert" : "status")}
    />
  );
});
export const AlertTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(function AlertTitle({ className, ...props }, ref) {
  return <h4 {...props} ref={ref} className={cn("font-medium leading-none", className)} />;
});
export const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(function AlertDescription({ className, ...props }, ref) {
  return <p {...props} ref={ref} className={cn("text-sm opacity-90", className)} />;
});
