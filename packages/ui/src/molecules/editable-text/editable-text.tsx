import * as React from "react";
import { cn } from "../../lib/cn.ts";
import { disabledControl, focusRing, typography } from "../../lib/styles.ts";

export type EditableTextProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "defaultValue" | "onChange"
> & {
  readonly controlId?: string;
  readonly defaultValue?: string;
  readonly disabled?: boolean;
  readonly invalid?: boolean;
  readonly multiline?: boolean;
  readonly name?: string;
  readonly onSave?: (value: string) => void;
  readonly onValueChange?: (value: string) => void;
  readonly placeholder?: string;
  readonly readOnly?: boolean;
  readonly required?: boolean;
  readonly value?: string;
  readonly variant?: "body" | "title";
};

const useControllableText = ({
  defaultValue = "",
  onValueChange,
  value,
}: Pick<EditableTextProps, "defaultValue" | "onValueChange" | "value">) => {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : uncontrolledValue;

  const setValue = React.useCallback(
    (nextValue: string) => {
      if (!isControlled) {
        setUncontrolledValue(nextValue);
      }
      onValueChange?.(nextValue);
    },
    [isControlled, onValueChange],
  );

  return [currentValue, setValue] as const;
};

const editableTextVariants = {
  body: cn(
    "min-h-9 resize-none text-foreground placeholder:text-muted-foreground/70",
    typography.body,
  ),
  title: cn("min-h-10 text-foreground placeholder:text-muted-foreground/60", typography.pageTitle),
} satisfies Record<NonNullable<EditableTextProps["variant"]>, string>;

export const EditableText = React.forwardRef<HTMLDivElement, EditableTextProps>(
  function EditableText(
    {
      "aria-describedby": ariaDescribedBy,
      "aria-invalid": ariaInvalidProp,
      "aria-label": ariaLabel,
      className,
      controlId,
      defaultValue,
      disabled = false,
      invalid = false,
      multiline = false,
      name,
      onSave,
      onValueChange,
      placeholder,
      readOnly = false,
      required = false,
      value,
      variant = "body",
      ...props
    },
    ref,
  ) {
    const valueOnFocusRef = React.useRef("");
    const [currentValue, setValue] = useControllableText({
      defaultValue,
      onValueChange,
      value,
    });
    const controlClassName = cn(
      "block w-full rounded-md border border-transparent bg-transparent px-1 py-1 shadow-none outline-none transition-colors hover:bg-subtle/50 focus:border-border focus:bg-subtle/55",
      focusRing,
      disabledControl,
      "aria-invalid:border-destructive aria-invalid:ring-destructive/20 read-only:cursor-default",
      editableTextVariants[variant],
    );
    const resolvedAriaInvalid = ariaInvalidProp ?? (invalid ? true : undefined);
    const resolvedAriaLabel =
      ariaLabel ?? placeholder ?? (variant === "title" ? "Editable title" : "Editable text");
    const handleBlur = (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onSave?.(event.currentTarget.value);
    };
    const handleFocus = (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      valueOnFocusRef.current = event.currentTarget.value;
    };
    const cancelEdit = (control: HTMLInputElement | HTMLTextAreaElement) => {
      setValue(valueOnFocusRef.current);
      control.value = valueOnFocusRef.current;
      control.blur();
    };
    const sharedControlProps = {
      "aria-describedby": ariaDescribedBy,
      "aria-invalid": resolvedAriaInvalid,
      "aria-label": resolvedAriaLabel,
      disabled,
      id: controlId,
      name,
      readOnly,
      required,
    };

    return (
      <div {...props} ref={ref} className={cn("min-w-0", className)}>
        {multiline ? (
          <textarea
            {...sharedControlProps}
            className={cn(controlClassName, "field-sizing-content")}
            onBlur={handleBlur}
            onChange={(event) => setValue(event.currentTarget.value)}
            onFocus={handleFocus}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancelEdit(event.currentTarget);
              }
            }}
            placeholder={placeholder}
            rows={1}
            value={currentValue}
          />
        ) : (
          <input
            {...sharedControlProps}
            className={controlClassName}
            onBlur={handleBlur}
            onChange={(event) => setValue(event.currentTarget.value)}
            onFocus={handleFocus}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancelEdit(event.currentTarget);
              } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.currentTarget.blur();
              }
            }}
            placeholder={placeholder}
            value={currentValue}
          />
        )}
      </div>
    );
  },
);
