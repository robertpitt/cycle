import * as React from "react";

import { cn } from "../../lib/cn.ts";
import { disabledControl, focusRing } from "../../lib/styles.ts";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  readonly invalid?: boolean;
};

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid = false, ...props },
  ref,
) {
  const ariaInvalid = props["aria-invalid"] ?? (invalid ? true : undefined);

  return React.createElement("textarea", {
    ...props,
    ref,
    "aria-invalid": ariaInvalid,
    className: cn(
      "flex min-h-24 w-full resize-y rounded-md border border-input bg-popover px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground hover:border-border aria-invalid:border-destructive aria-invalid:ring-destructive/20",
      focusRing,
      disabledControl,
      className,
    ),
    "data-invalid": ariaInvalid ? "" : undefined,
  });
});
