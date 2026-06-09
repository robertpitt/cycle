import * as React from "react";
import { cn } from "../../lib/cn.ts";
export type CardProps = React.HTMLAttributes<HTMLDivElement>;
export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, ...props },
  ref,
) {
  return (
    <div
      {...props}
      ref={ref}
      className={cn(
        "rounded-lg border border-border bg-elevated text-elevated-foreground shadow-card",
        className,
      )}
    />
  );
});
export const CardHeader = React.forwardRef<HTMLDivElement, CardProps>(function CardHeader(
  { className, ...props },
  ref,
) {
  return <div {...props} ref={ref} className={cn("grid gap-1.5 p-4", className)} />;
});
export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(function CardTitle({ className, ...props }, ref) {
  return (
    <h3
      {...props}
      ref={ref}
      className={cn("text-base font-semibold leading-none tracking-normal", className)}
    />
  );
});
export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(function CardDescription({ className, ...props }, ref) {
  return <p {...props} ref={ref} className={cn("text-sm text-muted-foreground", className)} />;
});
export const CardContent = React.forwardRef<HTMLDivElement, CardProps>(function CardContent(
  { className, ...props },
  ref,
) {
  return <div {...props} ref={ref} className={cn("p-4 pt-0", className)} />;
});
export const CardFooter = React.forwardRef<HTMLDivElement, CardProps>(function CardFooter(
  { className, ...props },
  ref,
) {
  return <div {...props} ref={ref} className={cn("flex items-center gap-2 p-4 pt-0", className)} />;
});
