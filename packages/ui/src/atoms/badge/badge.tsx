import { cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../lib/cn.ts";
import {
  type ComponentAppearance,
  normalizeTone,
  type ComponentTone,
  type LegacySemanticVariant,
} from "../../lib/contracts.ts";
export const badgeVariants = cva(
  "inline-flex w-fit items-center rounded-sm border px-2 py-0.5 text-xs font-medium",
  {
    defaultVariants: {
      appearance: "soft",
      tone: "neutral",
    },
    variants: {
      appearance: {
        outline: "bg-transparent",
        soft: "",
        solid: "border-transparent",
      },
      tone: {
        accent: "border-accent/25 bg-accent/12 text-accent",
        danger: "border-destructive/25 bg-destructive/10 text-destructive",
        info: "border-primary/25 bg-primary/10 text-primary",
        neutral: "border-border bg-subtle text-subtle-foreground",
        success: "border-success/25 bg-success/12 text-success",
        warning: "border-warning/25 bg-warning/14 text-warning",
      },
    },
    compoundVariants: [
      {
        appearance: "outline",
        className: "border-accent/35 bg-transparent text-accent",
        tone: "accent",
      },
      {
        appearance: "outline",
        className: "border-destructive/35 bg-transparent text-destructive",
        tone: "danger",
      },
      {
        appearance: "outline",
        className: "border-primary/35 bg-transparent text-primary",
        tone: "info",
      },
      {
        appearance: "outline",
        className: "border-border bg-transparent text-muted-foreground",
        tone: "neutral",
      },
      {
        appearance: "outline",
        className: "border-success/35 bg-transparent text-success",
        tone: "success",
      },
      {
        appearance: "outline",
        className: "border-warning/40 bg-transparent text-warning",
        tone: "warning",
      },
      {
        appearance: "solid",
        className: "bg-primary text-primary-foreground",
        tone: "info",
      },
      {
        appearance: "solid",
        className: "bg-accent text-accent-foreground",
        tone: "accent",
      },
      {
        appearance: "solid",
        className: "bg-destructive text-destructive-foreground",
        tone: "danger",
      },
      {
        appearance: "solid",
        className: "bg-success text-success-foreground",
        tone: "success",
      },
      {
        appearance: "solid",
        className: "bg-warning text-warning-foreground",
        tone: "warning",
      },
      {
        appearance: "solid",
        className: "bg-secondary text-secondary-foreground",
        tone: "neutral",
      },
    ],
  },
);
export type BadgeAppearance = ComponentAppearance;
export type BadgeLegacyVariant = LegacySemanticVariant | "outline";
export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  readonly appearance?: BadgeAppearance;
  /**
   * @deprecated Prefer `tone`. `variant` is retained for existing consumers.
   */
  readonly variant?: BadgeLegacyVariant;
  readonly tone?: ComponentTone;
};
const resolveBadgeTone = (tone?: ComponentTone, variant?: BadgeLegacyVariant) => {
  if (tone) {
    return tone;
  }
  if (variant === "outline") {
    return "neutral";
  }
  return normalizeTone(variant) ?? "neutral";
};
const resolveBadgeAppearance = (appearance?: BadgeAppearance, variant?: BadgeLegacyVariant) => {
  if (appearance) {
    return appearance;
  }
  if (variant === "outline") {
    return "outline";
  }
  if (variant === "primary") {
    return "solid";
  }
  return "soft";
};
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { appearance, className, tone, variant, ...props },
  ref,
) {
  const resolvedAppearance = resolveBadgeAppearance(appearance, variant);
  const resolvedTone = resolveBadgeTone(tone, variant);

  return (
    <span
      {...props}
      ref={ref}
      className={cn(
        badgeVariants({
          appearance: resolvedAppearance,
          tone: resolvedTone,
        }),
        className,
      )}
      data-appearance={resolvedAppearance}
      data-tone={resolvedTone}
    />
  );
});
