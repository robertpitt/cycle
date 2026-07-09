import { ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "../../lib/cn.ts";
import { focusRing } from "../../lib/styles.ts";
export type NavigationItemProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-current"
> & {
  readonly active?: boolean;
  readonly count?: React.ReactNode;
  readonly depth?: 0 | 1 | 2;
  readonly expanded?: boolean;
  readonly href?: string;
  readonly icon?: React.ReactNode;
  readonly label: React.ReactNode;
  readonly onNavigate?: React.MouseEventHandler<HTMLElement>;
  readonly showDisclosure?: boolean;
};
export const NavigationItem = React.forwardRef<HTMLButtonElement, NavigationItemProps>(
  function NavigationItem(
    {
      active = false,
      className,
      count,
      depth = 0,
      disabled = false,
      expanded,
      href,
      icon,
      label,
      onClick,
      onNavigate,
      showDisclosure = false,
      type = "button",
      ...props
    },
    ref,
  ) {
    const isExpandable = showDisclosure || expanded !== undefined;
    const classNames = cn(
      "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground",
      focusRing,
      active && "bg-subtle text-foreground",
      disabled && "pointer-events-none cursor-not-allowed opacity-45",
      depth === 1 && "pl-7",
      depth === 2 && "pl-10",
      className,
    );
    const children = (
      <>
        {icon ? (
          <span className="grid size-4 shrink-0 place-items-center text-muted-foreground">
            {icon}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count !== undefined && count !== null ? (
          <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {count}
          </span>
        ) : null}
        {showDisclosure ? (
          <ChevronDown
            aria-hidden
            className={cn(
              "size-3.5 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
            strokeWidth={2}
          />
        ) : null}
      </>
    );
    const handleNavigate = (event: React.MouseEvent<HTMLElement>) => {
      if (disabled) {
        event.preventDefault();
        return;
      }
      onClick?.(event as React.MouseEvent<HTMLButtonElement>);
      onNavigate?.(event);
    };

    if (href) {
      return (
        <a
          {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
          ref={ref as React.Ref<HTMLAnchorElement>}
          aria-current={active ? "page" : undefined}
          aria-disabled={disabled ? true : undefined}
          aria-expanded={isExpandable ? (expanded ?? false) : undefined}
          className={classNames}
          data-state={active ? "active" : "inactive"}
          href={disabled ? undefined : href}
          onClick={handleNavigate}
          tabIndex={disabled ? -1 : props.tabIndex}
        >
          {children}
        </a>
      );
    }

    return (
      <button
        {...props}
        ref={ref}
        aria-current={active ? "page" : undefined}
        aria-expanded={isExpandable ? (expanded ?? false) : undefined}
        className={classNames}
        data-state={active ? "active" : "inactive"}
        disabled={disabled}
        onClick={(event) => {
          if (disabled) {
            event.preventDefault();
            return;
          }
          onClick?.(event);
          onNavigate?.(event);
        }}
        tabIndex={props.tabIndex}
        type={type}
      >
        {children}
      </button>
    );
  },
);
