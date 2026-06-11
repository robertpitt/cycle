import { Button as BaseButton } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../lib/cn.ts";
import type { ComponentActionVariant, ComponentSize, ComponentTone } from "../../lib/contracts.ts";
import { disabledControl, focusRing } from "../../lib/styles.ts";

export type ButtonSize = ComponentSize | "icon";
export type ButtonLegacyVariant = "destructive";
export type ButtonVariant = ComponentActionVariant | ButtonLegacyVariant;

export const buttonVariants = cva(
  cn(
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium",
    "transition-[background-color,border-color,color,box-shadow,transform] active:translate-y-px",
    focusRing,
    disabledControl,
  ),
  {
    defaultVariants: {
      size: "md",
      variant: "primary",
    },
    variants: {
      size: {
        icon: "size-9 p-0",
        lg: "h-10 px-4",
        md: "h-9 px-3.5",
        sm: "h-8 px-3 text-xs",
      } satisfies Record<ButtonSize, string>,
      variant: {
        ghost: "bg-transparent shadow-none",
        link: "h-auto px-0 shadow-none underline-offset-4 hover:underline active:translate-y-0",
        outline: "border bg-popover shadow-sm",
        primary: "shadow-card",
        secondary: "shadow-sm",
      } satisfies Record<ComponentActionVariant, string>,
    },
  },
);

const buttonToneClassNames = {
  ghost: {
    accent: "text-accent hover:bg-accent/10",
    danger: "text-destructive hover:bg-destructive/10",
    info: "text-primary hover:bg-primary/10",
    neutral: "text-subtle-foreground hover:bg-subtle hover:text-foreground",
    success: "text-success hover:bg-success/10",
    warning: "text-warning hover:bg-warning/10",
  },
  link: {
    accent: "text-accent",
    danger: "text-destructive",
    info: "text-primary",
    neutral: "text-foreground",
    success: "text-success",
    warning: "text-warning",
  },
  outline: {
    accent: "border-accent/30 text-accent hover:bg-accent/10",
    danger: "border-destructive/30 text-destructive hover:bg-destructive/10",
    info: "border-input text-popover-foreground hover:border-border hover:bg-subtle",
    neutral: "border-input text-popover-foreground hover:border-border hover:bg-subtle",
    success: "border-success/30 text-success hover:bg-success/10",
    warning: "border-warning/30 text-warning hover:bg-warning/10",
  },
  primary: {
    accent: "bg-accent text-accent-foreground hover:bg-accent/90",
    danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    info: "bg-primary text-primary-foreground hover:bg-primary/90",
    neutral: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    success: "bg-success text-success-foreground hover:bg-success/90",
    warning: "bg-warning text-warning-foreground hover:bg-warning/90",
  },
  secondary: {
    accent: "bg-accent/12 text-accent hover:bg-accent/16",
    danger: "bg-destructive/10 text-destructive hover:bg-destructive/15",
    info: "bg-primary/10 text-primary hover:bg-primary/15",
    neutral: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    success: "bg-success/10 text-success hover:bg-success/15",
    warning: "bg-warning/14 text-warning hover:bg-warning/18",
  },
} satisfies Record<ComponentActionVariant, Record<ComponentTone, string>>;

const resolveButtonVariant = (variant?: ButtonVariant | null): ComponentActionVariant => {
  if (!variant || variant === "destructive") {
    return "primary";
  }

  return variant;
};

const resolveButtonTone = (
  tone?: ComponentTone | null,
  variant?: ButtonVariant | null,
): ComponentTone => tone ?? (variant === "destructive" ? "danger" : "info");

export type ButtonProps = Omit<BaseButton.Props, "className"> &
  Omit<VariantProps<typeof buttonVariants>, "size" | "variant"> & {
    readonly className?: string;
    readonly leftIcon?: React.ReactNode;
    readonly loading?: boolean;
    readonly loadingLabel?: string;
    readonly rightIcon?: React.ReactNode;
    readonly size?: ButtonSize;
    readonly tone?: ComponentTone;
    /**
     * Use `tone="danger"` with `variant="primary"` for destructive actions.
     *
     * @deprecated `variant="destructive"` is retained for existing consumers.
     */
    readonly variant?: ButtonVariant;
  };
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className,
    disabled,
    focusableWhenDisabled,
    leftIcon,
    loading = false,
    loadingLabel = "Loading",
    rightIcon,
    size,
    tone,
    type = "button",
    variant,
    ...props
  },
  ref,
) {
  const resolvedVariant = resolveButtonVariant(variant);
  const resolvedTone = resolveButtonTone(tone, variant);

  return (
    <BaseButton
      {...props}
      ref={ref as React.Ref<HTMLElement>}
      aria-busy={loading || undefined}
      className={cn(
        buttonVariants({
          size,
          variant: resolvedVariant,
        }),
        buttonToneClassNames[resolvedVariant][resolvedTone],
        className,
      )}
      data-tone={resolvedTone}
      data-variant={resolvedVariant}
      disabled={disabled || loading}
      focusableWhenDisabled={focusableWhenDisabled ?? loading}
      type={type}
    >
      {loading ? (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : leftIcon ? (
        <span className="grid size-4 shrink-0 place-items-center">{leftIcon}</span>
      ) : undefined}
      {loading ? <span className="sr-only">{loadingLabel}</span> : undefined}
      {children}
      {!loading && rightIcon ? (
        <span className="grid size-4 shrink-0 place-items-center">{rightIcon}</span>
      ) : undefined}
    </BaseButton>
  );
});
