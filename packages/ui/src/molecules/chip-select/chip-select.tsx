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
  readonly searchText?: string;
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
  readonly defaultSearchValue?: string;
  readonly emptyLabel?: React.ReactNode;
  readonly filterOption?: (option: ChipSelectOption, query: string) => boolean;
  readonly multiple?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly onSearchValueChange?: (value: string) => void;
  readonly onSelect?: (option: ChipSelectOption) => void;
  readonly open?: boolean;
  readonly panelClassName?: string;
  readonly searchPlaceholder?: string;
  readonly searchShortcut?: React.ReactNode;
  readonly searchValue?: string;
  readonly sections: readonly ChipSelectSection[];
  readonly selectedId?: string;
  readonly triggerActive?: boolean;
  readonly triggerIcon?: React.ReactNode;
  readonly triggerLabel: React.ReactNode;
  readonly triggerLabelText?: string;
  readonly widthClassName?: string;
};

const getTextFromNode = (node: React.ReactNode): string => {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }

  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(getTextFromNode).join(" ");
  }

  if (React.isValidElement<{ readonly children?: React.ReactNode }>(node)) {
    return getTextFromNode(node.props.children);
  }

  return "";
};

const defaultFilterOption = (option: ChipSelectOption, query: string): boolean => {
  const searchableText = [
    option.id,
    option.searchText,
    getTextFromNode(option.label),
    getTextFromNode(option.rightMeta),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();

  return searchableText.includes(query.toLocaleLowerCase());
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

const assignRef = <T,>(ref: React.ForwardedRef<T>, value: T | null) => {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref) {
    ref.current = value;
  }
};

export const ChipSelect = React.forwardRef<HTMLDivElement, ChipSelectProps>(function ChipSelect(
  {
    align = "start",
    className,
    closeOnSelect = true,
    defaultOpen = false,
    defaultSearchValue = "",
    emptyLabel = "No results",
    filterOption = defaultFilterOption,
    multiple = false,
    onOpenChange,
    onSearchValueChange,
    onSelect,
    open,
    panelClassName,
    searchPlaceholder,
    searchShortcut,
    searchValue,
    sections,
    selectedId,
    triggerActive,
    triggerIcon,
    triggerLabel,
    triggerLabelText,
    widthClassName = "w-[260px]",
    ...props
  },
  forwardedRef,
) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);
  const optionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = React.useId();
  const [currentOpen, setOpen] = useControlledOpen({
    defaultOpen,
    onOpenChange,
    open,
  });
  const searchControlled = searchValue !== undefined;
  const [uncontrolledSearchValue, setUncontrolledSearchValue] = React.useState(defaultSearchValue);
  const currentSearchValue = searchControlled ? searchValue : uncontrolledSearchValue;
  const normalizedQuery = currentSearchValue.trim();

  const setSearchValue = React.useCallback(
    (nextValue: string) => {
      if (!searchControlled) {
        setUncontrolledSearchValue(nextValue);
      }
      onSearchValueChange?.(nextValue);
    },
    [onSearchValueChange, searchControlled],
  );

  const filteredSections = React.useMemo(
    () =>
      sections
        .map((section) => ({
          ...section,
          options:
            normalizedQuery.length === 0
              ? section.options
              : section.options.filter((option) => filterOption(option, normalizedQuery)),
        }))
        .filter((section) => section.options.length > 0),
    [filterOption, normalizedQuery, sections],
  );
  const visibleOptions = React.useMemo(
    () => filteredSections.flatMap((section) => section.options),
    [filteredSections],
  );
  const hasOptions = visibleOptions.length > 0;

  const focusOption = React.useCallback(
    (startIndex: number, direction: 1 | -1 = 1) => {
      let index = startIndex;

      while (index >= 0 && index < visibleOptions.length) {
        if (!visibleOptions[index]?.disabled) {
          optionRefs.current[index]?.focus();
          return;
        }
        index += direction;
      }
    },
    [visibleOptions],
  );

  const closeAndRestoreFocus = React.useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, [setOpen]);

  const selectOption = React.useCallback(
    (option: ChipSelectOption) => {
      onSelect?.(option);
      if (closeOnSelect) {
        closeAndRestoreFocus();
      }
    },
    [closeAndRestoreFocus, closeOnSelect, onSelect],
  );

  React.useEffect(() => {
    if (!currentOpen) return;

    const frame = window.requestAnimationFrame(() => {
      if (searchPlaceholder) {
        searchInputRef.current?.focus();
        return;
      }

      const selectedIndex = visibleOptions.findIndex(
        (option) => !option.disabled && (option.selected ?? option.id === selectedId),
      );
      focusOption(Math.max(selectedIndex, 0));
    });

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeAndRestoreFocus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    closeAndRestoreFocus,
    currentOpen,
    focusOption,
    searchPlaceholder,
    selectedId,
    setOpen,
    visibleOptions,
  ]);

  let optionIndex = 0;

  return (
    <div
      {...props}
      ref={(node) => {
        rootRef.current = node;
        assignRef(forwardedRef, node);
      }}
      className={cn("relative inline-flex", className)}
    >
      <ChipTrigger
        ref={triggerRef}
        active={triggerActive}
        aria-controls={currentOpen ? listboxId : undefined}
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
            "absolute top-full z-50 mt-2 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-elevated",
            widthClassName,
            align === "end" ? "right-0" : "left-0",
            "max-sm:fixed max-sm:inset-x-3 max-sm:bottom-3 max-sm:top-auto max-sm:mt-0 max-sm:max-h-[70vh] max-sm:w-auto max-sm:overflow-y-auto",
            panelClassName,
          )}
        >
          {searchPlaceholder ? (
            <div className="flex h-11 items-center gap-3 border-b border-border px-3">
              <input
                ref={searchInputRef}
                aria-autocomplete="list"
                aria-controls={listboxId}
                aria-expanded={currentOpen}
                aria-label={searchPlaceholder}
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                onChange={(event) => setSearchValue(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" && hasOptions) {
                    event.preventDefault();
                    focusOption(0);
                  }
                }}
                placeholder={searchPlaceholder}
                role="combobox"
                value={currentSearchValue}
              />
              {searchShortcut ? <Kbd>{searchShortcut}</Kbd> : null}
            </div>
          ) : null}

          <div
            aria-label={triggerLabelText ?? (getTextFromNode(triggerLabel) || "Options")}
            aria-multiselectable={multiple || undefined}
            className="max-h-72 overflow-y-auto"
            id={listboxId}
            role="listbox"
          >
            {hasOptions ? (
              <div className="grid gap-1 p-2">
                {filteredSections.map((section, sectionIndex) => {
                  const sectionLabelId = `${listboxId}-${section.id}-label`;

                  return (
                    <div
                      aria-labelledby={section.label ? sectionLabelId : undefined}
                      className={cn(sectionIndex > 0 && "border-t border-border pt-2")}
                      key={section.id}
                      role="group"
                    >
                      {section.label ? (
                        <p
                          className="px-2 pb-1 pt-1 text-xs font-semibold text-muted-foreground"
                          id={sectionLabelId}
                        >
                          {section.label}
                        </p>
                      ) : null}
                      <div className="grid gap-1">
                        {section.options.map((option) => {
                          const selected = option.selected ?? option.id === selectedId;
                          const currentOptionIndex = optionIndex++;

                          return (
                            <button
                              ref={(node) => {
                                optionRefs.current[currentOptionIndex] = node;
                              }}
                              aria-selected={selected}
                              className={cn(
                                "grid min-h-9 grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-2 rounded-md px-2 text-left text-sm text-foreground transition-colors hover:bg-subtle",
                                selected && "bg-subtle",
                                option.disabled && "pointer-events-none opacity-45",
                                focusRing,
                              )}
                              disabled={option.disabled}
                              key={option.id}
                              onClick={() => selectOption(option)}
                              onKeyDown={(event) => {
                                const lastIndex = visibleOptions.length - 1;
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  selectOption(option);
                                } else if (event.key === "ArrowDown") {
                                  event.preventDefault();
                                  focusOption(Math.min(currentOptionIndex + 1, lastIndex), 1);
                                } else if (event.key === "ArrowUp") {
                                  event.preventDefault();
                                  if (currentOptionIndex === 0 && searchPlaceholder) {
                                    searchInputRef.current?.focus();
                                  } else {
                                    focusOption(Math.max(currentOptionIndex - 1, 0), -1);
                                  }
                                } else if (event.key === "Home") {
                                  event.preventDefault();
                                  focusOption(0);
                                } else if (event.key === "End") {
                                  event.preventDefault();
                                  focusOption(lastIndex, -1);
                                }
                              }}
                              role="option"
                              type="button"
                            >
                              <span className="grid size-6 place-items-center text-muted-foreground">
                                {option.icon}
                              </span>
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="min-w-0 flex-1 truncate font-medium">
                                  {option.label}
                                </span>
                                <span className="grid size-4 shrink-0 place-items-center text-primary">
                                  {selected ? <Check aria-hidden className="size-4" /> : null}
                                </span>
                                {option.rightMeta ? (
                                  <span className="min-w-0 max-w-[55%] shrink overflow-hidden break-words text-right text-xs font-medium leading-4 text-muted-foreground">
                                    {option.rightMeta}
                                  </span>
                                ) : null}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-4 py-5 text-sm text-muted-foreground">{emptyLabel}</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
});
