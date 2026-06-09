import * as React from "react";
import { cn } from "../../lib/cn.ts";
export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;
export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { className, ...props },
  ref,
) {
  return (
    <div
      {...props}
      ref={ref}
      aria-hidden
      className={cn("animate-pulse rounded-md bg-subtle", className)}
    />
  );
});
