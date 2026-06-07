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
  return React.createElement(
    "div",
    {
      ...props,
      ref,
      className: cn("inline-flex items-center gap-2.5", className),
    },
    mark ??
      React.createElement(
        "span",
        {
          "aria-hidden": true,
          className: "grid size-7 place-items-center rounded-lg bg-foreground text-background",
        },
        React.createElement("span", {
          className: "size-3 rounded-sm border-2 border-background",
        }),
      ),
    showLabel
      ? React.createElement("span", { className: "text-sm font-semibold text-foreground" }, label)
      : null,
  );
});
