import { Button as BaseButton } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "../../lib/cn.ts";
import { disabledControl, focusRing } from "../../lib/styles.ts";

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
      },
      variant: {
        destructive:
          "bg-destructive text-destructive-foreground shadow-card hover:bg-destructive/90",
        ghost:
          "bg-transparent text-subtle-foreground shadow-none hover:bg-subtle hover:text-foreground",
        link: "h-auto px-0 text-primary shadow-none underline-offset-4 hover:underline active:translate-y-0",
        outline:
          "border border-input bg-popover text-popover-foreground shadow-sm hover:border-border hover:bg-subtle",
        primary: "bg-primary text-primary-foreground shadow-card hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
      },
    },
  },
);

export type ButtonProps = Omit<BaseButton.Props, "className"> &
  VariantProps<typeof buttonVariants> & {
    readonly className?: string;
    readonly leftIcon?: React.ReactNode;
    readonly loading?: boolean;
    readonly loadingLabel?: string;
    readonly rightIcon?: React.ReactNode;
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
    type = "button",
    variant,
    ...props
  },
  ref,
) {
  return React.createElement(
    BaseButton,
    {
      ...props,
      ref: ref as React.Ref<HTMLElement>,
      "aria-busy": loading || undefined,
      className: cn(buttonVariants({ size, variant }), className),
      disabled: disabled || loading,
      focusableWhenDisabled: focusableWhenDisabled ?? loading,
      type,
    },
    loading
      ? React.createElement("span", {
          "aria-hidden": true,
          className:
            "size-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        })
      : leftIcon
        ? React.createElement(
            "span",
            { className: "grid size-4 shrink-0 place-items-center" },
            leftIcon,
          )
        : undefined,
    loading ? React.createElement("span", { className: "sr-only" }, loadingLabel) : undefined,
    children,
    !loading && rightIcon
      ? React.createElement(
          "span",
          { className: "grid size-4 shrink-0 place-items-center" },
          rightIcon,
        )
      : undefined,
  );
});
