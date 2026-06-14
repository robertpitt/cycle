import { Check, Circle, CircleCheck, CircleDashed, CircleOff, UserRound } from "lucide-react";
import * as React from "react";
import { Avatar, AvatarFallback } from "../../atoms/avatar/index.ts";
import { cn } from "../../lib/cn.ts";

export type IssuePriorityMarkProps = {
  readonly className?: string;
  readonly priority?: string | null;
  readonly size?: "md" | "sm";
};

export type IssueStatusMarkProps = {
  readonly className?: string;
  readonly colored?: boolean;
  readonly size?: "md" | "sm";
  readonly status?: string | null;
};

export type IssueAssigneeMarkProps = {
  readonly className?: string;
  readonly name?: string | null;
  readonly size?: "md" | "sm";
};

export type IssuePropertyMenuOption = {
  readonly disabled?: boolean;
  readonly icon?: React.ReactNode;
  readonly label: React.ReactNode;
  readonly rightMeta?: React.ReactNode;
  readonly value: string;
};

export type IssuePropertyOptionMenuProps = {
  readonly align?: "end" | "start";
  readonly disabled?: boolean;
  readonly label: string;
  readonly onChange: (value: string, option: IssuePropertyMenuOption) => void;
  readonly options: readonly IssuePropertyMenuOption[];
  readonly stopPropagation?: boolean;
  readonly trigger: React.ReactNode;
  readonly value: string;
  readonly widthClassName?: string;
};

export type IssuePropertyPopoverProps = {
  readonly align?: "end" | "start";
  readonly children: (close: () => void) => React.ReactNode;
  readonly disabled?: boolean;
  readonly label: string;
  readonly onOpenChange?: (open: boolean) => void;
  readonly stopPropagation?: boolean;
  readonly trigger: React.ReactNode;
  readonly widthClassName?: string;
};

const iconSizeClassName = {
  md: "size-5",
  sm: "size-4",
} satisfies Record<NonNullable<IssuePriorityMarkProps["size"]>, string>;

const priorityLevel = (priority: string): number => {
  if (priority === "urgent") return 4;
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
};

const initialsForName = (name: string): string =>
  name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

const normalizedValue = (value: string | null | undefined, fallback = "none"): string => {
  const nextValue = value?.trim().toLowerCase();
  return nextValue && nextValue.length > 0 ? nextValue : fallback;
};

export const IssuePriorityMark = ({ className, priority, size = "sm" }: IssuePriorityMarkProps) => {
  const normalizedPriority = normalizedValue(priority);

  if (normalizedPriority === "none") {
    return (
      <span
        className={cn(
          "font-semibold leading-none text-muted-foreground",
          size === "md" ? "text-xs" : "text-sm",
          className,
        )}
      >
        --
      </span>
    );
  }

  if (normalizedPriority === "urgent") {
    return (
      <span
        className={cn(
          "grid place-items-center rounded-sm bg-destructive font-bold leading-none text-destructive-foreground",
          size === "md" ? "size-5 text-xs" : "size-4 text-[11px]",
          className,
        )}
      >
        !
      </span>
    );
  }

  const level = priorityLevel(normalizedPriority);

  return (
    <span
      aria-hidden
      className={cn(
        "flex h-5 items-end gap-0.5 text-muted-foreground",
        size === "md" && "h-5",
        className,
      )}
    >
      {[1, 2, 3].map((bar) => (
        <span
          className="w-1.5 rounded-sm bg-current data-[muted=true]:opacity-35"
          data-muted={bar > level}
          key={bar}
          style={{
            height: `${bar * 5 + 4}px`,
          }}
        />
      ))}
    </span>
  );
};

export const IssueStatusMark = ({
  className,
  colored = true,
  size = "sm",
  status,
}: IssueStatusMarkProps) => {
  const normalizedStatus = normalizedValue(status, "todo");
  const colorClassName =
    colored && normalizedStatus === "in-progress"
      ? "text-warning"
      : colored && (normalizedStatus === "done" || normalizedStatus === "closed")
        ? "text-primary"
        : "text-muted-foreground";
  const nextClassName = cn(iconSizeClassName[size], colorClassName, className);

  if (normalizedStatus === "done" || normalizedStatus === "closed") {
    return <CircleCheck aria-hidden className={nextClassName} strokeWidth={2.4} />;
  }

  if (normalizedStatus === "backlog") {
    return <CircleDashed aria-hidden className={nextClassName} strokeWidth={2.2} />;
  }

  if (normalizedStatus === "canceled") {
    return <CircleOff aria-hidden className={nextClassName} strokeWidth={2.4} />;
  }

  return <Circle aria-hidden className={nextClassName} strokeWidth={2.4} />;
};

export const IssueAssigneeMark = ({ className, name, size = "sm" }: IssueAssigneeMarkProps) => {
  const normalizedName = name?.trim();

  if (!normalizedName || normalizedName === "none") {
    return <UserRound aria-hidden className={cn(iconSizeClassName[size], className)} />;
  }

  if (size === "md") {
    return (
      <Avatar className={cn("size-6", className)}>
        <AvatarFallback className="text-[10px]">{initialsForName(normalizedName)}</AvatarFallback>
      </Avatar>
    );
  }

  return (
    <span
      className={cn(
        "grid size-5 place-items-center rounded-full bg-subtle text-[10px] font-semibold text-muted-foreground",
        className,
      )}
    >
      {initialsForName(normalizedName)}
    </span>
  );
};

const useOutsideClose = ({
  onClose,
  open,
  ref,
}: {
  readonly onClose: () => void;
  readonly open: boolean;
  readonly ref: React.RefObject<HTMLElement | null>;
}) => {
  React.useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && ref.current?.contains(event.target)) return;
      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open, ref]);
};

const stopEventPropagation = (event: React.SyntheticEvent) => {
  event.stopPropagation();
};

const triggerClassName =
  "grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45";

const panelClassName =
  "absolute top-full z-50 mt-2 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-elevated";

const panelPositionClassName = (align: "end" | "start") => (align === "end" ? "right-0" : "left-0");

export const IssuePropertyOptionMenu = ({
  align = "start",
  disabled = false,
  label,
  onChange,
  options,
  stopPropagation = false,
  trigger,
  value,
  widthClassName = "w-[260px]",
}: IssuePropertyOptionMenuProps) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const close = React.useCallback(() => setOpen(false), []);

  useOutsideClose({
    onClose: close,
    open,
    ref,
  });

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (stopPropagation) event.stopPropagation();
    if (event.key === "Escape") close();
  };

  return (
    <div
      className="relative inline-flex"
      onClick={stopPropagation ? stopEventPropagation : undefined}
      onKeyDown={handleMenuKeyDown}
      onPointerDown={stopPropagation ? stopEventPropagation : undefined}
      ref={ref}
    >
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className={cn(triggerClassName, open && "bg-subtle text-foreground shadow-sm")}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        title={label}
        type="button"
      >
        {trigger}
      </button>
      {open ? (
        <div
          className={cn(panelClassName, panelPositionClassName(align), "p-2", widthClassName)}
          role="menu"
        >
          {options.map((option) => {
            const selected = option.value === value;

            return (
              <button
                aria-checked={selected}
                className={cn(
                  "grid min-h-10 w-full grid-cols-[1.5rem_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg px-2 text-left text-sm text-foreground transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
                  selected && "bg-subtle",
                  option.disabled && "pointer-events-none opacity-45",
                )}
                disabled={option.disabled}
                key={option.value}
                onClick={() => {
                  if (!selected) onChange(option.value, option);
                  close();
                }}
                role="menuitemradio"
                type="button"
              >
                <span className="grid size-6 place-items-center text-muted-foreground">
                  {option.icon}
                </span>
                <span className="min-w-0 truncate font-medium">{option.label}</span>
                <span className="grid size-4 place-items-center text-muted-foreground">
                  {selected ? <Check aria-hidden className="size-4" /> : null}
                </span>
                {option.rightMeta ? (
                  <span className="min-w-5 text-right text-xs font-medium text-muted-foreground">
                    {option.rightMeta}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export const IssuePropertyPopover = ({
  align = "start",
  children,
  disabled = false,
  label,
  onOpenChange,
  stopPropagation = false,
  trigger,
  widthClassName = "w-[260px]",
}: IssuePropertyPopoverProps) => {
  const [open, setOpenState] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      setOpenState(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [onOpenChange],
  );
  const close = React.useCallback(() => setOpen(false), [setOpen]);

  useOutsideClose({
    onClose: close,
    open,
    ref,
  });

  return (
    <div
      className="relative inline-flex"
      onClick={stopPropagation ? stopEventPropagation : undefined}
      onPointerDown={stopPropagation ? stopEventPropagation : undefined}
      ref={ref}
    >
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        className={cn(triggerClassName, open && "bg-subtle text-foreground shadow-sm")}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        title={label}
        type="button"
      >
        {trigger}
      </button>
      {open ? (
        <div
          className={cn(panelClassName, panelPositionClassName(align), "p-3", widthClassName)}
          role="dialog"
        >
          {children(close)}
        </div>
      ) : null}
    </div>
  );
};
