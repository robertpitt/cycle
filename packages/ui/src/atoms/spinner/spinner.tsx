import * as React from "react";
import { cn } from "../../lib/cn.ts";
export type SpinnerProps = React.HTMLAttributes<HTMLSpanElement> & {
  readonly decorative?: boolean;
  readonly label?: string;
};
export const Spinner = React.forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner(
  { className, decorative = false, label = "Loading", role, ...props },
  ref,
) {
  return (
    <span
      {...props}
      ref={ref}
      aria-hidden={decorative ? true : props["aria-hidden"]}
      className={cn(
        "inline-flex size-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
      role={decorative ? undefined : (role ?? "status")}
    >
      {decorative ? null : <span className="sr-only">{label}</span>}
    </span>
  );
});
