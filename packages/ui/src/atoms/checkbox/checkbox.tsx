import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Check, Minus } from "lucide-react";
import * as React from "react";
import { cn } from "../../lib/cn.ts";
import { isAriaInvalid } from "../../lib/contracts.ts";
import { disabledControl, focusRing } from "../../lib/styles.ts";
export type CheckboxProps = Omit<BaseCheckbox.Root.Props, "children" | "className" | "inputRef"> & {
  readonly className?: string;
  readonly invalid?: boolean;
};
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, invalid = false, ...props },
  ref,
) {
  const ariaInvalid = props["aria-invalid"] ?? (invalid ? true : undefined);
  return (
    <BaseCheckbox.Root
      {...props}
      inputRef={ref}
      aria-invalid={ariaInvalid}
      className={cn(
        "inline-grid size-4 shrink-0 place-items-center rounded-sm border border-input bg-popover text-primary-foreground shadow-sm transition-colors hover:border-border",
        "data-[checked]:border-primary data-[checked]:bg-primary data-[indeterminate]:border-primary data-[indeterminate]:bg-primary",
        "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 data-[invalid]:border-destructive data-[invalid]:ring-2 data-[invalid]:ring-destructive/20",
        focusRing,
        disabledControl,
        className,
      )}
      data-invalid={isAriaInvalid(ariaInvalid) ? "" : undefined}
    >
      <BaseCheckbox.Indicator className="group grid size-full place-items-center">
        <Check aria-hidden className="size-3 group-data-[indeterminate]:hidden" strokeWidth={3} />
        <Minus
          aria-hidden
          className="hidden size-3 group-data-[indeterminate]:block"
          strokeWidth={3}
        />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
});
