import { Field as BaseField } from "@base-ui/react/field";
import * as React from "react";
import { cn } from "../../lib/cn.ts";
export type LabelProps = Omit<BaseField.Label.Props, "className"> & {
  readonly className?: string;
};
export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(function Label(
  { className, ...props },
  ref,
) {
  return (
    <BaseField.Label
      {...props}
      ref={ref as React.Ref<HTMLElement>}
      className={cn(
        "text-sm font-medium leading-none text-subtle-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className,
      )}
    />
  );
});
