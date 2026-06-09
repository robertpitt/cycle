import * as React from "react";
import { cn } from "../../lib/cn.ts";
export type BrandMarkProps = React.HTMLAttributes<HTMLDivElement> & {
  readonly label?: string;
  readonly mark?: React.ReactNode;
  readonly showLabel?: boolean;
};
export const BrandMark = React.forwardRef<HTMLDivElement, BrandMarkProps>(function BrandMark(
  { className, label = "Cycle", mark, showLabel = true, ...props },
  ref,
) {
  return (
    <div {...props} ref={ref} className={cn("inline-flex items-center gap-2.5", className)}>
      {mark ?? (
        <span
          aria-hidden
          className="grid size-7 place-items-center rounded-lg bg-foreground text-background"
        >
          <span className="size-3 rounded-sm border-2 border-background" />
        </span>
      )}
      {showLabel ? <span className="text-sm font-semibold text-foreground">{label}</span> : null}
    </div>
  );
});
