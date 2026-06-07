import { Switch as BaseSwitch } from "@base-ui/react/switch";
import * as React from "react";

import { cn } from "../../lib/cn.ts";
import { disabledControl, focusRing } from "../../lib/styles.ts";

export type SwitchProps = Omit<BaseSwitch.Root.Props, "children" | "className" | "inputRef"> & {
  readonly className?: string;
  readonly invalid?: boolean;
};

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { className, invalid = false, ...props },
  ref,
) {
  const ariaInvalid = props["aria-invalid"] ?? (invalid ? true : undefined);

  return React.createElement(
    BaseSwitch.Root,
    {
      ...props,
      inputRef: ref,
      "aria-invalid": ariaInvalid,
      className: cn(
        "inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent bg-input p-0.5 shadow-sm transition-colors hover:bg-border",
        "data-[checked]:bg-primary aria-invalid:ring-2 aria-invalid:ring-destructive/25 data-[invalid]:ring-2 data-[invalid]:ring-destructive/25",
        focusRing,
        disabledControl,
        className,
      ),
    },
    React.createElement(BaseSwitch.Thumb, {
      className:
        "block size-4 translate-x-0 rounded-full bg-background shadow-sm transition-transform data-[checked]:translate-x-4",
    }),
  );
});
