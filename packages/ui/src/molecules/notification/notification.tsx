import { AlertCircle, CheckCircle2, CircleAlert, Info, Sparkles, X } from "lucide-react";
import * as React from "react";
import { Button } from "../../atoms/button/index.ts";
import { cn } from "../../lib/cn.ts";
import type { ComponentTone } from "../../lib/contracts.ts";
import { focusRing, typography } from "../../lib/styles.ts";

export type NotificationAction = {
  readonly label: React.ReactNode;
  readonly onSelect: () => void;
};

export type NotificationProps = Omit<React.HTMLAttributes<HTMLLIElement>, "title"> & {
  readonly action?: NotificationAction;
  readonly description?: React.ReactNode;
  readonly dismissLabel?: string;
  readonly meta?: React.ReactNode;
  readonly onDismiss?: () => void;
  readonly tone?: ComponentTone;
  readonly title: React.ReactNode;
};

export type NotificationViewportPlacement =
  | "bottom-left"
  | "bottom-right"
  | "top-left"
  | "top-right";

export type NotificationViewportProps = React.HTMLAttributes<HTMLOListElement> & {
  readonly placement?: NotificationViewportPlacement;
};

const toneClassName = {
  accent: {
    icon: "bg-accent/12 text-accent",
    root: "border-accent/25",
  },
  danger: {
    icon: "bg-destructive/12 text-destructive",
    root: "border-destructive/30",
  },
  info: {
    icon: "bg-primary/10 text-primary",
    root: "border-border",
  },
  neutral: {
    icon: "bg-muted text-muted-foreground",
    root: "border-border",
  },
  success: {
    icon: "bg-success/12 text-success",
    root: "border-success/25",
  },
  warning: {
    icon: "bg-warning/12 text-warning",
    root: "border-warning/25",
  },
} satisfies Record<ComponentTone, { readonly icon: string; readonly root: string }>;

const placementClassName = {
  "bottom-left": "bottom-4 left-4 items-start",
  "bottom-right": "bottom-4 right-4 items-end",
  "top-left": "left-4 top-4 items-start",
  "top-right": "right-4 top-4 items-end",
} satisfies Record<NotificationViewportPlacement, string>;

const iconForTone = (tone: ComponentTone) => {
  switch (tone) {
    case "accent":
      return <Sparkles aria-hidden className="size-4" />;
    case "danger":
      return <AlertCircle aria-hidden className="size-4" />;
    case "success":
      return <CheckCircle2 aria-hidden className="size-4" />;
    case "warning":
      return <CircleAlert aria-hidden className="size-4" />;
    case "info":
    case "neutral":
      return <Info aria-hidden className="size-4" />;
  }
};

export const Notification = React.forwardRef<HTMLLIElement, NotificationProps>(
  function Notification(
    {
      action,
      className,
      description,
      dismissLabel = "Dismiss notification",
      id,
      meta,
      onDismiss,
      role,
      tone = "info",
      title,
      ...props
    },
    ref,
  ) {
    const titleId = id ? `${id}-title` : undefined;
    const descriptionId = id && description ? `${id}-description` : undefined;
    const resolvedRole = role ?? (tone === "danger" || tone === "warning" ? "alert" : "status");

    return (
      <li
        {...props}
        ref={ref}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        className={cn(
          "grid w-[min(24rem,calc(100vw-2rem))] grid-cols-[2rem_minmax(0,1fr)_auto] gap-3 rounded-lg border bg-popover px-3 py-3 text-popover-foreground shadow-elevated",
          toneClassName[tone].root,
          className,
        )}
        data-tone={tone}
        id={id}
        role={resolvedRole}
      >
        <span
          className={cn(
            "mt-0.5 grid size-8 shrink-0 place-items-center rounded-md",
            toneClassName[tone].icon,
          )}
        >
          {iconForTone(tone)}
        </span>
        <span className="grid min-w-0 gap-1">
          <span className="flex min-w-0 items-start justify-between gap-3">
            <span
              className={cn(typography.panelTitle, "min-w-0 truncate text-popover-foreground")}
              id={titleId}
            >
              {title}
            </span>
            {meta ? (
              <span className={cn(typography.meta, "shrink-0 text-muted-foreground")}>{meta}</span>
            ) : null}
          </span>
          {description ? (
            <span
              className="line-clamp-3 text-sm leading-5 text-muted-foreground"
              id={descriptionId}
            >
              {description}
            </span>
          ) : null}
          {action ? (
            <span className="mt-1">
              <Button onClick={action.onSelect} size="sm" type="button" variant="outline">
                {action.label}
              </Button>
            </span>
          ) : null}
        </span>
        {onDismiss ? (
          <button
            aria-label={dismissLabel}
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-subtle hover:text-foreground",
              focusRing,
            )}
            onClick={onDismiss}
            type="button"
          >
            <X aria-hidden className="size-4" />
          </button>
        ) : null}
      </li>
    );
  },
);

export const NotificationViewport = React.forwardRef<HTMLOListElement, NotificationViewportProps>(
  function NotificationViewport(
    {
      children,
      className,
      "aria-label": ariaLabel = "Notifications",
      placement = "bottom-right",
      ...props
    },
    ref,
  ) {
    return (
      <ol
        {...props}
        ref={ref}
        aria-label={ariaLabel}
        className={cn(
          "pointer-events-none fixed z-[70] grid max-w-[calc(100vw-2rem)] gap-2",
          placementClassName[placement],
          "[&>*]:pointer-events-auto",
          className,
        )}
      >
        {children}
      </ol>
    );
  },
);
