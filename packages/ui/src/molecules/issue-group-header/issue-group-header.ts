import { Plus } from "lucide-react";
import * as React from "react";

import { IconButton } from "../../atoms/icon-button/index.ts";
import { StatusIndicator, type StatusIndicatorProps } from "../../atoms/status-indicator/index.ts";
import { cn } from "../../lib/cn.ts";

export type IssueGroupHeaderProps = Omit<React.HTMLAttributes<HTMLDivElement>, "title"> & {
  readonly action?: React.ReactNode;
  readonly actionLabel?: string;
  readonly count?: React.ReactNode;
  readonly onAction?: React.MouseEventHandler<HTMLButtonElement>;
  readonly statusTone?: StatusIndicatorProps["tone"];
  readonly title: React.ReactNode;
};

export const IssueGroupHeader = React.forwardRef<HTMLDivElement, IssueGroupHeaderProps>(
  function IssueGroupHeader(
    {
      action,
      actionLabel = "Create issue",
      className,
      count,
      onAction,
      statusTone = "success",
      title,
      ...props
    },
    ref,
  ) {
    return React.createElement(
      "div",
      {
        ...props,
        ref,
        className: cn(
          "flex h-12 items-center gap-3 border-b border-border bg-subtle/55 px-7 text-sm",
          className,
        ),
      },
      React.createElement(StatusIndicator, {
        label: String(title),
        shape: "ring",
        tone: statusTone,
      }),
      React.createElement("span", { className: "text-base font-semibold text-foreground" }, title),
      count !== undefined && count !== null
        ? React.createElement("span", { className: "text-sm text-muted-foreground" }, count)
        : null,
      action ??
        React.createElement(IconButton, {
          className: "ml-auto",
          icon: React.createElement(Plus, { "aria-hidden": true, className: "size-4" }),
          label: actionLabel,
          onClick: onAction,
          size: "sm",
        }),
    );
  },
);
