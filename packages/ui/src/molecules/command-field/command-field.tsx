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
    const children = (
      <>
        <Search aria-hidden className="size-4" strokeWidth={1.8} />
        <span>{label}</span>
        {shortcut ? <Kbd className="ml-auto">{shortcut}</Kbd> : null}
      </>
    );
    const classNames = cn(
      "flex h-9 w-full items-center gap-2 rounded-lg border border-transparent bg-subtle px-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
      as === "button" && focusRing,
      className,
    );

    if (as === "div") {
      const { type: _type, ...divProps } = props;

      return (
        <div
          {...(divProps as React.HTMLAttributes<HTMLDivElement>)}
          ref={ref as React.Ref<HTMLDivElement>}
          aria-label={props["aria-label"] ?? label}
          className={classNames}
        >
          {children}
        </div>
      );
    }

    return (
      <button
        {...props}
        ref={ref}
        aria-label={props["aria-label"] ?? label}
        className={classNames}
        type={props.type ?? "button"}
      >
        {children}
      </button>
    );
  },
);
