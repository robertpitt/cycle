import * as React from "react";
import { cn } from "../../lib/cn.ts";
import { focusRing, typography } from "../../lib/styles.ts";

export type EditableTextProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "defaultValue" | "onChange"
> & {
  readonly defaultValue?: string;
  readonly multiline?: boolean;
  readonly onSave?: (value: string) => void;
  readonly onValueChange?: (value: string) => void;
  readonly placeholder?: string;
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
      className,
      defaultValue,
      multiline = false,
      onSave,
      onValueChange,
      placeholder,
      value,
      variant = "body",
      ...props
    },
    ref,
  ) {
    const [currentValue, setValue] = useControllableText({
      defaultValue,
      onValueChange,
      value,
    });
    const controlClassName = cn(
      "block w-full rounded-md border border-transparent bg-transparent px-1 py-1 shadow-none outline-none transition-colors hover:bg-subtle/50 focus:border-border focus:bg-subtle/55",
      focusRing,
      editableTextVariants[variant],
    );

    return (
      <div {...props} ref={ref} className={cn("min-w-0", className)}>
        {multiline ? (
          <textarea
            className={cn(controlClassName, "field-sizing-content")}
            onBlur={(event) => onSave?.(event.currentTarget.value)}
            onChange={(event) => setValue(event.currentTarget.value)}
            placeholder={placeholder}
            rows={1}
            value={currentValue}
          />
        ) : (
          <input
            className={controlClassName}
            onBlur={(event) => onSave?.(event.currentTarget.value)}
            onChange={(event) => setValue(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
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
