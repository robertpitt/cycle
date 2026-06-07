import * as React from "react";

import { cn } from "../../lib/cn.ts";

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { className, ...props },
  ref,
) {
  return React.createElement("div", {
    ...props,
    ref,
    "aria-hidden": true,
    className: cn("animate-pulse rounded-md bg-subtle", className),
  });
});
