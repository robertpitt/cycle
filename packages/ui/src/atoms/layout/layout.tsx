import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../lib/cn.ts";
export const containerVariants = cva("mx-auto w-full px-4 sm:px-6", {
  defaultVariants: {
    size: "lg",
  },
  variants: {
    size: {
      full: "max-w-none",
      lg: "max-w-5xl",
      md: "max-w-3xl",
      sm: "max-w-xl",
      xl: "max-w-7xl",
    },
  },
});
export type ContainerProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof containerVariants>;
export const Container = React.forwardRef<HTMLDivElement, ContainerProps>(function Container(
  { className, size, ...props },
  ref,
) {
  return (
    <div
      {...props}
      ref={ref}
      className={cn(
        containerVariants({
          size,
        }),
        className,
      )}
    />
  );
});
export const stackVariants = cva("flex", {
  defaultVariants: {
    direction: "col",
    gap: "md",
  },
  variants: {
    align: {
      center: "items-center",
      end: "items-end",
      start: "items-start",
      stretch: "items-stretch",
    },
    direction: {
      col: "flex-col",
      row: "flex-row",
    },
    gap: {
      lg: "gap-6",
      md: "gap-4",
      none: "gap-0",
      sm: "gap-2",
      xl: "gap-8",
      xs: "gap-1",
    },
    justify: {
      between: "justify-between",
      center: "justify-center",
      end: "justify-end",
      start: "justify-start",
    },
  },
});
export type StackProps = React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof stackVariants>;
export const Stack = React.forwardRef<HTMLDivElement, StackProps>(function Stack(
  { align, className, direction, gap, justify, ...props },
  ref,
) {
  return (
    <div
      {...props}
      ref={ref}
      className={cn(
        stackVariants({
          align,
          direction,
          gap,
          justify,
        }),
        className,
      )}
    />
  );
});
