import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../lib/cn.ts";
import type { ComponentTone } from "../../lib/contracts.ts";

export const textVariants = cva("tracking-normal", {
  defaultVariants: {
    tone: "foreground",
    truncate: false,
    variant: "body",
    wrap: "normal",
  },
  variants: {
    align: {
      center: "text-center",
      end: "text-right",
      start: "text-left",
    },
    tone: {
      accent: "text-accent",
      danger: "text-destructive",
      foreground: "text-foreground",
      inherit: "text-inherit",
      info: "text-primary",
      muted: "text-muted-foreground",
      neutral: "text-foreground",
      subtle: "text-subtle-foreground",
      success: "text-success",
      warning: "text-warning",
    },
    truncate: {
      false: "",
      true: "truncate",
      "line-clamp-2": "line-clamp-2",
      "line-clamp-3": "line-clamp-3",
    },
    variant: {
      body: "text-base leading-7",
      bodyCompact: "text-sm leading-6",
      code: "font-mono text-sm leading-6",
      control: "text-sm font-medium leading-5",
      meta: "text-xs font-medium leading-4",
      pageTitle: "text-2xl font-semibold leading-8",
      panelTitle: "text-sm font-semibold leading-5",
      sectionTitle: "text-base font-semibold leading-6",
    },
    wrap: {
      balance: "text-balance",
      break: "break-words",
      normal: "whitespace-normal",
      nowrap: "whitespace-nowrap",
    },
  },
});

export type TextElement = keyof React.JSX.IntrinsicElements;
export type TextTone = ComponentTone | "foreground" | "muted" | "subtle" | "inherit";
export type TextVariant = NonNullable<VariantProps<typeof textVariants>["variant"]>;
export type TextWrap = NonNullable<VariantProps<typeof textVariants>["wrap"]>;
export type TextTruncate = NonNullable<VariantProps<typeof textVariants>["truncate"]>;

export type TextProps = Omit<React.HTMLAttributes<HTMLElement>, "color"> & {
  readonly align?: NonNullable<VariantProps<typeof textVariants>["align"]>;
  readonly as?: TextElement;
  readonly tone?: TextTone;
  readonly truncate?: TextTruncate;
  readonly variant?: TextVariant;
  readonly wrap?: TextWrap;
};

export const Text = React.forwardRef<HTMLElement, TextProps>(function Text(
  {
    align,
    as,
    className,
    tone = "foreground",
    truncate = false,
    variant = "body",
    wrap = "normal",
    ...props
  },
  ref,
) {
  const Element = (as ?? "span") as React.ElementType;

  return React.createElement(Element, {
    ...props,
    ref,
    className: cn(textVariants({ align, tone, truncate, variant, wrap }), className),
    "data-tone": tone,
    "data-variant": variant,
  });
});
