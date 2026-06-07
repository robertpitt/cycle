import { Search } from "lucide-react";
import * as React from "react";

import { Kbd } from "../../atoms/kbd/index.ts";
import { cn } from "../../lib/cn.ts";
import { focusRing } from "../../lib/styles.ts";

export type CommandFieldProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  readonly as?: "button" | "div";
  readonly label?: string;
  readonly shortcut?: string;
};

export const CommandField = React.forwardRef<HTMLButtonElement, CommandFieldProps>(
  function CommandField(
    { as = "button", className, label = "Search", shortcut = "K", ...props },
    ref,
  ) {
    const Element = as;

    return React.createElement(
      Element,
      {
        ...props,
        ref: ref as React.Ref<HTMLButtonElement & HTMLDivElement>,
        "aria-label": props["aria-label"] ?? label,
        className: cn(
          "flex h-9 w-full items-center gap-2 rounded-lg border border-transparent bg-subtle px-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          as === "button" && focusRing,
          className,
        ),
        type: as === "button" ? (props.type ?? "button") : undefined,
      },
      React.createElement(Search, { "aria-hidden": true, className: "size-4", strokeWidth: 1.8 }),
      React.createElement("span", null, label),
      shortcut ? React.createElement(Kbd, { className: "ml-auto" }, shortcut) : null,
    );
  },
);
