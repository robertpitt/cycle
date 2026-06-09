import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import * as React from "react";
import { cn } from "../../lib/cn.ts";
import { disabledControl, focusRing } from "../../lib/styles.ts";
export type SelectItem = {
  readonly disabled?: boolean;
  readonly label: React.ReactNode;
  readonly value: string;
};
export type SelectProps = Omit<BaseSelect.Root.Props<string>, "children" | "items" | "multiple"> & {
  readonly "aria-describedby"?: string;
  readonly "aria-invalid"?: React.AriaAttributes["aria-invalid"];
  readonly "aria-label"?: string;
  readonly "aria-labelledby"?: string;
  readonly children?: React.ReactNode;
  readonly className?: string;
  readonly invalid?: boolean;
  readonly items?: readonly SelectItem[];
  readonly label?: React.ReactNode;
  readonly placeholder?: React.ReactNode;
};
const getTextFromNode = (node: React.ReactNode): string => {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(getTextFromNode).join("");
  }
  return "";
};
const getItemsFromOptionChildren = (children: React.ReactNode): readonly SelectItem[] =>
  React.Children.toArray(children).flatMap((child) => {
    if (!React.isValidElement(child) || child.type !== "option") {
      return [];
    }
    const optionProps = child.props as React.OptionHTMLAttributes<HTMLOptionElement>;
    const text = getTextFromNode(optionProps.children);
    return [
      {
        disabled: optionProps.disabled,
        label: optionProps.children,
        value: String(optionProps.value ?? text),
      },
    ];
  });
const StringSelectRoot = BaseSelect.Root as (
  props: BaseSelect.Root.Props<string>,
) => React.ReactElement;
export const Select = React.forwardRef<HTMLButtonElement, SelectProps>(function Select(
  {
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalidProp,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    children,
    className,
    invalid = false,
    items,
    label,
    placeholder = "Select",
    ...rootProps
  },
  ref,
) {
  const portalContainerRef = React.useRef<HTMLSpanElement>(null);
  const ariaInvalid = ariaInvalidProp ?? (invalid ? true : undefined);
  const resolvedItems = React.useMemo(
    () => items ?? getItemsFromOptionChildren(children),
    [children, items],
  );
  const valueItems = React.useMemo(
    () =>
      resolvedItems.map(({ label: itemLabel, value }) => ({
        label: itemLabel,
        value,
      })),
    [resolvedItems],
  );
  return (
    <StringSelectRoot {...rootProps} items={valueItems}>
      <span className="contents" ref={portalContainerRef}>
        {label ? (
          <BaseSelect.Label className="mb-1.5 text-sm font-medium leading-none text-subtle-foreground">
            {label}
          </BaseSelect.Label>
        ) : null}
        <BaseSelect.Trigger
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-popover px-3 py-2 text-left text-sm text-foreground shadow-sm",
            "hover:border-border data-[placeholder]:text-muted-foreground aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[invalid]:border-destructive data-[invalid]:ring-destructive/20",
            focusRing,
            disabledControl,
            className,
          )}
          ref={ref}
        >
          <BaseSelect.Value className="min-w-0 flex-1 truncate" placeholder={placeholder} />
          <BaseSelect.Icon className="grid size-4 shrink-0 place-items-center text-muted-foreground">
            <ChevronsUpDown aria-hidden className="size-4" strokeWidth={1.8} />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
        <BaseSelect.Portal container={portalContainerRef}>
          <BaseSelect.Positioner
            alignItemWithTrigger={false}
            className="z-50 outline-none"
            sideOffset={4}
          >
            <BaseSelect.Popup className="min-w-[var(--anchor-width)] overflow-hidden rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-elevated">
              <BaseSelect.ScrollUpArrow className="grid h-6 place-items-center text-muted-foreground">
                <ChevronUp aria-hidden className="size-4" strokeWidth={1.8} />
              </BaseSelect.ScrollUpArrow>
              <BaseSelect.List className="max-h-72 overflow-y-auto p-1 outline-none">
                {resolvedItems.map((item, index) => (
                  <BaseSelect.Item
                    className={cn(
                      "relative flex min-h-8 cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none",
                      "data-[highlighted]:bg-subtle data-[highlighted]:text-foreground data-[selected]:font-medium data-[disabled]:pointer-events-none data-[disabled]:opacity-45",
                    )}
                    disabled={item.disabled}
                    key={`${item.value}-${index}`}
                    label={getTextFromNode(item.label)}
                    value={item.value}
                  >
                    <BaseSelect.ItemIndicator className="absolute left-2 grid size-4 place-items-center text-primary">
                      <Check aria-hidden className="size-4" strokeWidth={2} />
                    </BaseSelect.ItemIndicator>
                    <BaseSelect.ItemText className="min-w-0 truncate">
                      {item.label}
                    </BaseSelect.ItemText>
                  </BaseSelect.Item>
                ))}
              </BaseSelect.List>
              <BaseSelect.ScrollDownArrow className="grid h-6 place-items-center text-muted-foreground">
                <ChevronDown aria-hidden className="size-4" strokeWidth={1.8} />
              </BaseSelect.ScrollDownArrow>
            </BaseSelect.Popup>
          </BaseSelect.Positioner>
        </BaseSelect.Portal>
      </span>
    </StringSelectRoot>
  );
});
export const SelectRoot = BaseSelect.Root;
export const SelectLabel = BaseSelect.Label;
export const SelectTrigger = BaseSelect.Trigger;
export const SelectValue = BaseSelect.Value;
export const SelectIcon = BaseSelect.Icon;
export const SelectPortal = BaseSelect.Portal;
export const SelectPositioner = BaseSelect.Positioner;
export const SelectPopup = BaseSelect.Popup;
export const SelectList = BaseSelect.List;
export const SelectItem = BaseSelect.Item;
export const SelectItemText = BaseSelect.ItemText;
export const SelectItemIndicator = BaseSelect.ItemIndicator;
