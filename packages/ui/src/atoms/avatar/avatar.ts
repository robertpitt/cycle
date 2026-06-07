import { Avatar as BaseAvatar } from "@base-ui/react/avatar";
import * as React from "react";

import { cn } from "../../lib/cn.ts";

export type AvatarProps = Omit<BaseAvatar.Root.Props, "className" | "render"> & {
  readonly className?: string;
};

export const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(function Avatar(
  { className, ...props },
  ref,
) {
  return React.createElement(BaseAvatar.Root, {
    ...props,
    ref: ref as React.Ref<HTMLElement>,
    className: cn(
      "relative flex size-9 shrink-0 overflow-hidden rounded-full bg-subtle ring-1 ring-border",
      className,
    ),
    render: React.createElement("div"),
  });
});

export type AvatarImageProps = Omit<BaseAvatar.Image.Props, "className"> & {
  readonly className?: string;
};

export const AvatarImage = React.forwardRef<HTMLImageElement, AvatarImageProps>(
  function AvatarImage({ className, ...props }, ref) {
    return React.createElement(BaseAvatar.Image, {
      ...props,
      ref,
      className: cn("aspect-square size-full object-cover", className),
    });
  },
);

export type AvatarFallbackProps = Omit<BaseAvatar.Fallback.Props, "className"> & {
  readonly className?: string;
};

export const AvatarFallback = React.forwardRef<HTMLSpanElement, AvatarFallbackProps>(
  function AvatarFallback({ className, ...props }, ref) {
    return React.createElement(BaseAvatar.Fallback, {
      ...props,
      ref,
      className: cn(
        "flex size-full items-center justify-center bg-subtle text-sm font-medium text-subtle-foreground",
        className,
      ),
    });
  },
);
