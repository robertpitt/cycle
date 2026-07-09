import { Input as BaseInput } from "@base-ui/react/input";
import * as React from "react";
import { cn } from "../../lib/cn.ts";
import { isAriaInvalid } from "../../lib/contracts.ts";
import { disabledControl, focusRing } from "../../lib/styles.ts";
export type InputProps = Omit<BaseInput.Props, "className"> & {
  readonly className?: string;
  readonly invalid?: boolean;
};
export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid = false, type = "text", ...props },
  ref,
) {
  const ariaInvalid = props["aria-invalid"] ?? (invalid ? true : undefined);
  return (
    <BaseInput
      {...props}
      ref={ref as React.Ref<HTMLElement>}
      aria-invalid={ariaInvalid}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-popover px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "hover:border-border aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        focusRing,
        disabledControl,
        className,
      )}
      data-invalid={isAriaInvalid(ariaInvalid) ? "" : undefined}
      type={type}
    />
  );
});
