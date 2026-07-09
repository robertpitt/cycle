import * as React from "react";
import {
  normalizeOtpLength,
  normalizeOtpValue,
  pasteOtpDigits,
  removeOtpDigit,
  replaceOtpDigit,
} from "../../internal/otp-code.ts";
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
export const OtpCodeField = React.forwardRef<HTMLDivElement, OtpCodeFieldProps>(
  function OtpCodeField(
    {
      autoFocus = false,
      "aria-label": ariaLabel,
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
    const resolvedLength = normalizeOtpLength(length);
    const inputRefs = React.useRef<Array<HTMLInputElement | null>>([]);
    const isControlled = value !== undefined;
    const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
    const resolvedValue = isControlled ? value : uncontrolledValue;
    const chars = normalizeOtpValue(resolvedValue, resolvedLength).split("");
    const stringValue = chars.join("");
    const setValue = React.useCallback(
      (nextValue: string, nextFocusIndex?: number) => {
        const normalized = normalizeOtpValue(nextValue, resolvedLength);
        if (!isControlled) {
          setUncontrolledValue(normalized);
        }
        onValueChange?.(normalized);
        if (nextFocusIndex !== undefined) {
          window.requestAnimationFrame(() => inputRefs.current[nextFocusIndex]?.focus());
        }
      },
      [isControlled, onValueChange, resolvedLength],
    );
    const handleKeyDown = React.useCallback(
      (event: React.KeyboardEvent<HTMLInputElement>, index: number) => {
        if (event.key === "Backspace") {
          event.preventDefault();
          const removeIndex = chars[index] ? index : Math.max(index - 1, 0);
          setValue(removeOtpDigit(stringValue, removeIndex, resolvedLength), removeIndex);
          return;
        }
        if (event.key === "Delete" && chars[index]) {
          event.preventDefault();
          setValue(removeOtpDigit(stringValue, index, resolvedLength), index);
          return;
        }
        if (event.key === "ArrowLeft" && index > 0) {
          event.preventDefault();
          inputRefs.current[index - 1]?.focus();
        }
        if (event.key === "ArrowRight" && index < resolvedLength - 1) {
          event.preventDefault();
          inputRefs.current[index + 1]?.focus();
        }
      },
      [chars, resolvedLength, setValue, stringValue],
    );
    return (
      <div
        {...props}
        ref={ref}
        aria-label={ariaLabel ?? `${resolvedLength} digit verification code`}
        aria-invalid={invalid ? true : undefined}
        className={cn("grid gap-2", className)}
        data-invalid={invalid ? "" : undefined}
        data-value-state={stringValue.length === resolvedLength ? "complete" : "incomplete"}
        role="group"
        style={{
          gridTemplateColumns: `repeat(${resolvedLength}, minmax(0, 2.5rem))`,
          ...style,
        }}
      >
        {name ? <input disabled={disabled} name={name} type="hidden" value={stringValue} /> : null}
        {Array.from(
          {
            length: resolvedLength,
          },
          (_, index) => (
            <input
              aria-label={`Digit ${index + 1}`}
              aria-invalid={invalid ? true : undefined}
              autoComplete={index === 0 ? "one-time-code" : undefined}
              autoFocus={autoFocus && index === 0}
              className={cn(
                "grid size-10 rounded-lg border border-input bg-popover text-center text-sm font-medium text-foreground shadow-sm",
                "hover:border-border aria-invalid:border-destructive aria-invalid:ring-destructive/20",
                focusRing,
                disabledControl,
              )}
              disabled={disabled}
              inputMode="numeric"
              key={index}
              maxLength={2}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                const nextValue = replaceOtpDigit(
                  stringValue,
                  index,
                  event.currentTarget.value,
                  resolvedLength,
                );
                const nextFocusIndex = Math.min(index + 1, resolvedLength - 1);
                setValue(nextValue, nextFocusIndex);
              }}
              onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) =>
                handleKeyDown(event, index)
              }
              onPaste={(event: React.ClipboardEvent<HTMLInputElement>) => {
                event.preventDefault();
                const pastedDigits = normalizeOtpValue(
                  event.clipboardData.getData("text"),
                  resolvedLength - index,
                );
                const nextValue = pasteOtpDigits(stringValue, index, pastedDigits, resolvedLength);
                setValue(
                  nextValue,
                  Math.min(index + Math.max(pastedDigits.length, 1), resolvedLength - 1),
                );
              }}
              pattern="[0-9]*"
              ref={(node: HTMLInputElement | null) => {
                inputRefs.current[index] = node;
              }}
              type="text"
              value={chars[index] ?? ""}
            />
          ),
        )}
      </div>
    );
  },
);
