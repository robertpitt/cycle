import { Separator as BaseSeparator } from "@base-ui/react/separator";
import * as React from "react";
import { cn } from "../../lib/cn.ts";
export type SeparatorProps = Omit<BaseSeparator.Props, "className"> & {
  readonly className?: string;
  readonly decorative?: boolean;
};
export const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(function Separator(
  { className, decorative = true, orientation = "horizontal", role, ...props },
  ref,
) {
  return (
    <BaseSeparator
      {...props}
      ref={ref}
      aria-orientation={decorative ? undefined : orientation}
      className={cn(
        "shrink-0 bg-border/80",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      role={role ?? (decorative ? "none" : "separator")}
    />
  );
});
