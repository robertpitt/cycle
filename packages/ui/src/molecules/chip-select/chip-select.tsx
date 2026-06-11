import { Check } from "lucide-react";
import * as React from "react";
import { ChipTrigger } from "../../atoms/chip-trigger/index.ts";
import { Kbd } from "../../atoms/kbd/index.ts";
import { cn } from "../../lib/cn.ts";
import { focusRing } from "../../lib/styles.ts";

export type ChipSelectOption = {
  readonly disabled?: boolean;
  readonly icon?: React.ReactNode;
  readonly id: string;
  readonly label: React.ReactNode;
  readonly rightMeta?: React.ReactNode;
  readonly selected?: boolean;
};

export type ChipSelectSection = {
  readonly id: string;
  readonly label?: React.ReactNode;
  readonly options: readonly ChipSelectOption[];
};

export type ChipSelectProps = Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect"> & {
  readonly align?: "end" | "start";
  readonly closeOnSelect?: boolean;
  readonly defaultOpen?: boolean;
  readonly emptyLabel?: React.ReactNode;
  readonly onOpenChange?: (open: boolean) => void;
  readonly onSelect?: (option: ChipSelectOption) => void;
  readonly open?: boolean;
  readonly panelClassName?: string;
  readonly searchPlaceholder?: string;
  readonly searchShortcut?: React.ReactNode;
  readonly sections: readonly ChipSelectSection[];
  readonly selectedId?: string;
  readonly triggerActive?: boolean;
  readonly triggerIcon?: React.ReactNode;
  readonly triggerLabel: React.ReactNode;
  readonly triggerLabelText?: string;
  readonly widthClassName?: string;
};

const useControlledOpen = ({
  defaultOpen = false,
  onOpenChange,
  open,
}: Pick<ChipSelectProps, "defaultOpen" | "onOpenChange" | "open">) => {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isControlled = open !== undefined;
  const currentOpen = isControlled ? open : uncontrolledOpen;

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [isControlled, onOpenChange],
  );

  return [currentOpen, setOpen] as const;
};

export const ChipSelect = React.forwardRef<HTMLDivElement, ChipSelectProps>(function ChipSelect(
  {
    align = "start",
    className,
    closeOnSelect = true,
    defaultOpen = false,
    emptyLabel = "No results",
    onOpenChange,
    onSelect,
    open,
    panelClassName,
    searchPlaceholder,
    searchShortcut,
    sections,
    selectedId,
    triggerActive,
    triggerIcon,
    triggerLabel,
    triggerLabelText,
    widthClassName = "w-[260px]",
    ...props
  },
  ref,
) {
  const [currentOpen, setOpen] = useControlledOpen({
    defaultOpen,
    onOpenChange,
    open,
  });
  const hasOptions = sections.some((section) => section.options.length > 0);

  return (
    <div {...props} ref={ref} className={cn("relative inline-flex", className)}>
      <ChipTrigger
        active={triggerActive}
        aria-haspopup="listbox"
        icon={triggerIcon}
        label={triggerLabel}
        onClick={() => setOpen(!currentOpen)}
        open={currentOpen}
        title={triggerLabelText}
      />
      {currentOpen ? (
        <div
          className={cn(
            "absolute top-full z-50 mt-2 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-elevated",
            widthClassName,
            align === "end" ? "right-0" : "left-0",
            "max-sm:fixed max-sm:inset-x-3 max-sm:bottom-3 max-sm:top-auto max-sm:mt-0 max-sm:max-h-[70vh] max-sm:w-auto max-sm:overflow-y-auto",
            panelClassName,
          )}
          role="listbox"
        >
          {searchPlaceholder ? (
            <div className="flex h-14 items-center gap-3 border-b border-border px-4">
              <input
                aria-label={searchPlaceholder}
                className="min-w-0 flex-1 bg-transparent text-lg text-foreground outline-none placeholder:text-muted-foreground"
                placeholder={searchPlaceholder}
              />
              {searchShortcut ? <Kbd>{searchShortcut}</Kbd> : null}
            </div>
          ) : null}

          {hasOptions ? (
            <div className="grid gap-1 p-2">
              {sections.map((section, sectionIndex) => (
                <React.Fragment key={section.id}>
                  {sectionIndex > 0 ? <div className="-mx-2 my-2 border-t border-border" /> : null}
                  {section.label ? (
                    <p className="px-2 pb-1 pt-2 text-sm font-semibold text-muted-foreground">
                      {section.label}
                    </p>
                  ) : null}
                  {section.options.map((option) => {
                    const selected = option.selected ?? option.id === selectedId;
                    return (
                      <button
                        aria-selected={selected}
                        className={cn(
                          "grid min-h-11 grid-cols-[1.5rem_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg px-2 text-left text-base text-foreground transition-colors hover:bg-subtle",
                          selected && "bg-subtle",
                          option.disabled && "pointer-events-none opacity-45",
                          focusRing,
                        )}
                        disabled={option.disabled}
                        key={option.id}
                        onClick={() => {
                          onSelect?.(option);
                          if (closeOnSelect) {
                            setOpen(false);
                          }
                        }}
                        role="option"
                        type="button"
                      >
                        <span className="grid size-6 place-items-center text-muted-foreground">
                          {option.icon}
                        </span>
                        <span className="min-w-0 truncate font-medium">{option.label}</span>
                        <span className="grid size-5 place-items-center text-muted-foreground">
                          {selected ? <Check aria-hidden className="size-5" /> : null}
                        </span>
                        {option.rightMeta ? (
                          <span className="min-w-5 text-right text-sm font-medium text-muted-foreground">
                            {option.rightMeta}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          ) : (
            <div className="px-4 py-5 text-sm text-muted-foreground">{emptyLabel}</div>
          )}
        </div>
      ) : null}
    </div>
  );
});
