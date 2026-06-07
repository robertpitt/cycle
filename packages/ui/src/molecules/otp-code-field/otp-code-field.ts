import * as React from "react";

import { cn } from "../../lib/cn.ts";
import { disabledControl, focusRing } from "../../lib/styles.ts";

export type OtpCodeFieldProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "defaultValue" | "onChange"
> & {
  readonly autoFocus?: boolean;
  readonly defaultValue?: string;
  readonly disabled?: boolean;
  readonly invalid?: boolean;
  readonly length?: number;
  readonly name?: string;
  readonly onValueChange?: (value: string) => void;
  readonly value?: string;
};

const normalizeValue = (value: string, length: number) =>
  value.replace(/\D/g, "").slice(0, length).split("");

export const OtpCodeField = React.forwardRef<HTMLDivElement, OtpCodeFieldProps>(
  function OtpCodeField(
    {
      autoFocus = false,
      className,
      defaultValue = "",
      disabled = false,
      invalid = false,
      length = 6,
      name,
      onValueChange,
      style,
      value,
      ...props
    },
    ref,
  ) {
    const inputRefs = React.useRef<Array<HTMLInputElement | null>>([]);
    const isControlled = value !== undefined;
    const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
    const resolvedValue = isControlled ? value : uncontrolledValue;
    const chars = normalizeValue(resolvedValue, length);
    const stringValue = chars.join("");

    const setValue = React.useCallback(
      (nextValue: string, nextFocusIndex?: number) => {
        const normalized = normalizeValue(nextValue, length).join("");

        if (!isControlled) {
          setUncontrolledValue(normalized);
        }

        onValueChange?.(normalized);

        if (nextFocusIndex !== undefined) {
          window.requestAnimationFrame(() => inputRefs.current[nextFocusIndex]?.focus());
        }
      },
      [isControlled, length, onValueChange],
    );

    const updateAtIndex = React.useCallback(
      (index: number, nextInputValue: string) => {
        const nextChars = [...chars];
        const nextCharsFromInput = normalizeValue(nextInputValue, length - index);

        nextCharsFromInput.forEach((char, offset) => {
          nextChars[index + offset] = char;
        });

        const nextFocusIndex = Math.min(index + Math.max(nextCharsFromInput.length, 1), length - 1);
        setValue(nextChars.join(""), nextFocusIndex);
      },
      [chars, length, setValue],
    );

    const handleKeyDown = React.useCallback(
      (event: React.KeyboardEvent<HTMLInputElement>, index: number) => {
        if (event.key === "Backspace" && !chars[index] && index > 0) {
          event.preventDefault();
          const nextChars = [...chars];
          nextChars[index - 1] = "";
          setValue(nextChars.join(""), index - 1);
        }

        if (event.key === "ArrowLeft" && index > 0) {
          event.preventDefault();
          inputRefs.current[index - 1]?.focus();
        }

        if (event.key === "ArrowRight" && index < length - 1) {
          event.preventDefault();
          inputRefs.current[index + 1]?.focus();
        }
      },
      [chars, length, setValue],
    );

    return React.createElement(
      "div",
      {
        ...props,
        ref,
        "aria-label": `${length} digit verification code`,
        "aria-invalid": invalid ? true : undefined,
        className: cn("grid gap-2", className),
        "data-invalid": invalid ? "" : undefined,
        "data-value-state": stringValue.length === length ? "complete" : "incomplete",
        role: "group",
        style: {
          gridTemplateColumns: `repeat(${length}, minmax(0, 2.5rem))`,
          ...style,
        },
      },
      name ? React.createElement("input", { name, type: "hidden", value: stringValue }) : null,
      ...Array.from({ length }, (_, index) =>
        React.createElement("input", {
          "aria-label": `Digit ${index + 1}`,
          "aria-invalid": invalid ? true : undefined,
          autoComplete: index === 0 ? "one-time-code" : undefined,
          autoFocus: autoFocus && index === 0,
          className: cn(
            "grid size-10 rounded-lg border border-input bg-popover text-center text-sm font-medium text-foreground shadow-sm",
            "hover:border-border aria-invalid:border-destructive aria-invalid:ring-destructive/20",
            focusRing,
            disabledControl,
          ),
          disabled,
          inputMode: "numeric",
          key: index,
          maxLength: length,
          onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
            updateAtIndex(index, event.currentTarget.value),
          onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => handleKeyDown(event, index),
          onPaste: (event: React.ClipboardEvent<HTMLInputElement>) => {
            event.preventDefault();
            updateAtIndex(index, event.clipboardData.getData("text"));
          },
          pattern: "[0-9]*",
          ref: (node: HTMLInputElement | null) => {
            inputRefs.current[index] = node;
          },
          type: "text",
          value: chars[index] ?? "",
        }),
      ),
    );
  },
);
