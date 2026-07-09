import * as React from "react";
import { cn } from "../../lib/cn.ts";
import {
  ChipSelect,
  type ChipSelectOption,
  type ChipSelectProps,
  type ChipSelectSection,
} from "../chip-select/index.ts";

export type PropertyPickerOption = ChipSelectOption;

export type PropertyPickerSection = ChipSelectSection;

export type PropertyPickerValue = string | readonly string[] | null;

export type PropertyPickerProps = Omit<
  ChipSelectProps,
  "closeOnSelect" | "onSelect" | "sections" | "selectedId" | "triggerLabel"
> & {
  readonly closeOnSelect?: boolean;
  readonly defaultValue?: PropertyPickerValue;
  readonly formatValueLabel?: (
    selectedOptions: readonly PropertyPickerOption[],
    value: PropertyPickerValue,
  ) => React.ReactNode;
  readonly multiple?: boolean;
  readonly onOptionSelect?: (option: PropertyPickerOption) => void;
  readonly onValueChange?: (value: PropertyPickerValue, option: PropertyPickerOption) => void;
  readonly placeholder?: React.ReactNode;
  readonly sections: readonly PropertyPickerSection[];
  readonly value?: PropertyPickerValue;
};

const selectedIdsFromValue = (value: PropertyPickerValue) =>
  new Set(Array.isArray(value) ? value : value ? [value] : []);

const getOptionText = (node: React.ReactNode): string => {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }

  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(getOptionText).join("");
  }

  return "";
};

const getSelectedOptions = (
  sections: readonly PropertyPickerSection[],
  selectedIds: ReadonlySet<string>,
) => sections.flatMap((section) => section.options.filter((option) => selectedIds.has(option.id)));

const getTriggerLabel = (
  selectedOptions: readonly PropertyPickerOption[],
  placeholder: React.ReactNode,
) => {
  if (selectedOptions.length === 0) {
    return placeholder;
  }

  const labels = selectedOptions.map((option) => getOptionText(option.label)).filter(Boolean);

  if (labels.length === 0) {
    return placeholder;
  }

  return labels.join(", ");
};

const withSelectedOptions = (
  sections: readonly PropertyPickerSection[],
  selectedIds: ReadonlySet<string>,
) =>
  sections.map((section) => ({
    ...section,
    options: section.options.map((option) => ({
      ...option,
      selected: selectedIds.has(option.id),
    })),
  }));

export const PropertyPicker = React.forwardRef<HTMLDivElement, PropertyPickerProps>(
  function PropertyPicker(
    {
      className,
      closeOnSelect,
      defaultValue = null,
      formatValueLabel,
      multiple = false,
      onOptionSelect,
      onValueChange,
      placeholder = "Select",
      sections,
      triggerActive,
      value,
      ...props
    },
    ref,
  ) {
    const isControlled = value !== undefined;
    const [uncontrolledValue, setUncontrolledValue] =
      React.useState<PropertyPickerValue>(defaultValue);
    const currentValue = isControlled ? value : uncontrolledValue;
    const selectedIds = selectedIdsFromValue(currentValue);
    const selectedOptions = getSelectedOptions(sections, selectedIds);
    const triggerLabel =
      formatValueLabel?.(selectedOptions, currentValue) ??
      getTriggerLabel(selectedOptions, placeholder);

    return (
      <ChipSelect
        {...props}
        ref={ref}
        className={cn("max-w-full", className)}
        closeOnSelect={closeOnSelect ?? !multiple}
        multiple={multiple}
        onSelect={(option) => {
          const nextValue = multiple
            ? selectedIds.has(option.id)
              ? [...selectedIds].filter((id) => id !== option.id)
              : [...selectedIds, option.id]
            : option.id;

          if (!isControlled) {
            setUncontrolledValue(nextValue);
          }

          onOptionSelect?.(option);
          onValueChange?.(nextValue, option);
        }}
        sections={withSelectedOptions(sections, selectedIds)}
        triggerActive={triggerActive ?? selectedOptions.length > 0}
        triggerLabel={triggerLabel}
      />
    );
  },
);
