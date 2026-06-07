import * as React from "react";

import { cn } from "../../lib/cn.ts";

export type SpinnerProps = React.HTMLAttributes<HTMLSpanElement> & {
  readonly label?: string;
};

export const Spinner = React.forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner(
  { className, label = "Loading", ...props },
  ref,
) {
  return React.createElement(
    "span",
    {
      ...props,
      ref,
      className: cn(
        "inline-flex size-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      ),
      role: "status",
    },
    React.createElement("span", { className: "sr-only" }, label),
  );
});
