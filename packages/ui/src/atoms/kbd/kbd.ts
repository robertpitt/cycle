import * as React from "react";

import { cn } from "../../lib/cn.ts";

export type KbdProps = React.HTMLAttributes<HTMLElement>;

export const Kbd = React.forwardRef<HTMLElement, KbdProps>(function Kbd(
  { className, ...props },
  ref,
) {
  return React.createElement("kbd", {
    ...props,
    ref,
    className: cn(
      "inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-border bg-elevated px-1.5 font-mono text-[0.6875rem] font-medium text-muted-foreground shadow-card",
      className,
    ),
  });
});
