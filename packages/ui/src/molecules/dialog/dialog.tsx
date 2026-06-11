import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "../../lib/cn.ts";
import { focusRing } from "../../lib/styles.ts";

export const DialogRoot = BaseDialog.Root;
export const DialogTrigger = BaseDialog.Trigger;
export const DialogPortal = BaseDialog.Portal;
export const DialogViewport = React.forwardRef<HTMLDivElement, BaseDialog.Viewport.Props>(
  function DialogViewport({ className, ...props }, ref) {
    return (
      <BaseDialog.Viewport
        {...props}
        ref={ref}
        className={cn(
          "fixed inset-0 z-50 grid min-h-dvh place-items-center overflow-y-auto p-4 sm:p-6",
          className,
        )}
      />
    );
  },
);

export const DialogBackdrop = React.forwardRef<HTMLDivElement, BaseDialog.Backdrop.Props>(
  function DialogBackdrop({ className, ...props }, ref) {
    return (
      <BaseDialog.Backdrop
        {...props}
        ref={ref}
        className={cn("fixed inset-0 z-50 bg-overlay/65 backdrop-blur-[1px]", className)}
      />
    );
  },
);

const dialogPanelVariants = cva(
  "relative flex max-h-[min(90dvh,920px)] w-full flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-elevated",
  {
    defaultVariants: {
      width: "md",
    },
    variants: {
      width: {
        full: "max-w-[calc(100vw-2rem)]",
        lg: "max-w-[720px]",
        md: "max-w-[560px]",
        sm: "max-w-[420px]",
        xl: "max-w-[960px]",
      },
    },
  },
);

export type DialogPanelProps = BaseDialog.Popup.Props &
  VariantProps<typeof dialogPanelVariants> & {
    readonly className?: string;
  };

export const DialogPanel = React.forwardRef<HTMLDivElement, DialogPanelProps>(function DialogPanel(
  { className, width, ...props },
  ref,
) {
  return (
    <BaseDialog.Popup
      {...props}
      ref={ref}
      className={cn(
        dialogPanelVariants({
          width,
        }),
        className,
      )}
    />
  );
});

export type DialogHeaderProps = React.HTMLAttributes<HTMLDivElement>;

export const DialogHeader = React.forwardRef<HTMLDivElement, DialogHeaderProps>(
  function DialogHeader({ className, ...props }, ref) {
    return (
      <div
        {...props}
        ref={ref}
        className={cn(
          "flex items-start justify-between gap-4 border-b border-border px-5 py-4",
          className,
        )}
      />
    );
  },
);

export const DialogTitle = React.forwardRef<HTMLHeadingElement, BaseDialog.Title.Props>(
  function DialogTitle({ className, ...props }, ref) {
    return (
      <BaseDialog.Title
        {...props}
        ref={ref}
        className={cn("text-base font-semibold tracking-normal text-foreground", className)}
      />
    );
  },
);

export const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  BaseDialog.Description.Props
>(function DialogDescription({ className, ...props }, ref) {
  return (
    <BaseDialog.Description
      {...props}
      ref={ref}
      className={cn("mt-1 text-sm leading-6 text-muted-foreground", className)}
    />
  );
});

export type DialogBodyProps = React.HTMLAttributes<HTMLDivElement>;

export const DialogBody = React.forwardRef<HTMLDivElement, DialogBodyProps>(function DialogBody(
  { className, ...props },
  ref,
) {
  return <div {...props} ref={ref} className={cn("min-h-0 overflow-y-auto p-5", className)} />;
});

export type DialogFooterProps = React.HTMLAttributes<HTMLDivElement>;

export const DialogFooter = React.forwardRef<HTMLDivElement, DialogFooterProps>(
  function DialogFooter({ className, ...props }, ref) {
    return (
      <div
        {...props}
        ref={ref}
        className={cn(
          "flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4",
          className,
        )}
      />
    );
  },
);

export type DialogCloseButtonProps = Omit<BaseDialog.Close.Props, "children" | "className"> & {
  readonly className?: string;
  readonly label?: string;
};

export const DialogCloseButton = React.forwardRef<HTMLButtonElement, DialogCloseButtonProps>(
  function DialogCloseButton(
    { className, label = "Close dialog", type = "button", ...props },
    ref,
  ) {
    return (
      <BaseDialog.Close
        {...props}
        ref={ref}
        aria-label={label}
        className={cn(
          "inline-grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-subtle hover:text-foreground",
          focusRing,
          className,
        )}
        type={type}
      >
        <X aria-hidden className="size-4" />
      </BaseDialog.Close>
    );
  },
);

export const DialogClose = BaseDialog.Close;
