import * as React from "react";

import { Button, type ButtonProps } from "../button/index.ts";
import { cn } from "../../lib/cn.ts";
import type { ComponentSize } from "../../lib/contracts.ts";

export type IconButtonProps = Omit<ButtonProps, "children" | "size"> & {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly size?: ComponentSize;
};

const iconButtonSizeClassName = {
  lg: "size-10",
  md: "size-9",
  sm: "size-8",
} satisfies Record<ComponentSize, string>;

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, icon, label, size = "md", variant = "ghost", ...props },
  ref,
) {
  return React.createElement(
    Button,
    {
      ...props,
      ref,
      "aria-label": label,
      className: cn(iconButtonSizeClassName[size], className),
      size: "icon",
      variant,
    },
    icon,
  );
});
