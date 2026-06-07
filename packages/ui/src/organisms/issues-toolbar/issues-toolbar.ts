import {
  Bell,
  BarChart3,
  Filter,
  Layers2,
  PanelRight,
  Plus,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import * as React from "react";

import { Button } from "../../atoms/button/index.ts";
import { IconButton } from "../../atoms/icon-button/index.ts";
import { Separator } from "../../atoms/separator/index.ts";
import { cn } from "../../lib/cn.ts";
import { ViewTab } from "../../molecules/view-tab/index.ts";

const h = React.createElement;

export type IssuesToolbarTab = {
  readonly active?: boolean;
  readonly controls?: string;
  readonly disabled?: boolean;
  readonly count?: React.ReactNode;
  readonly icon?: LucideIcon;
  readonly label: React.ReactNode;
  readonly onSelect?: () => void;
  readonly value?: string;
};

export type IssuesToolbarProps = Omit<React.HTMLAttributes<HTMLDivElement>, "title"> & {
  readonly analyticsLabel?: string;
  readonly createLabel?: string;
  readonly displayActive?: boolean;
  readonly displayLabel?: string;
  readonly filterActive?: boolean;
  readonly filterControls?: React.ReactNode;
  readonly filterLabel?: React.ReactNode;
  readonly layersActive?: boolean;
  readonly layersLabel?: string;
  readonly moreCount?: number;
  readonly moreLabel?: React.ReactNode;
  readonly notificationsActive?: boolean;
  readonly notificationsLabel?: string;
  readonly onAnalytics?: React.MouseEventHandler<HTMLButtonElement>;
  readonly onCreate?: React.MouseEventHandler<HTMLButtonElement>;
  readonly onDisplay?: React.MouseEventHandler<HTMLButtonElement>;
  readonly onFilter?: React.MouseEventHandler<HTMLButtonElement>;
  readonly onNotifications?: React.MouseEventHandler<HTMLButtonElement>;
  readonly onPanel?: React.MouseEventHandler<HTMLButtonElement>;
  readonly onTabSelect?: (tab: IssuesToolbarTab) => void;
  readonly onToggleLayers?: React.MouseEventHandler<HTMLButtonElement>;
  readonly panelOpen?: boolean;
  readonly panelLabel?: string;
  readonly primaryAction?: React.ReactNode;
  readonly selectedTab?: string;
  readonly showSecondaryActions?: boolean;
  readonly tabs: readonly IssuesToolbarTab[];
  readonly title: React.ReactNode;
};

export const IssuesToolbar = React.forwardRef<HTMLDivElement, IssuesToolbarProps>(
  function IssuesToolbar(
    {
      analyticsLabel = "Analytics",
      className,
      createLabel = "Create",
      displayActive = false,
      displayLabel = "Display",
      filterActive = false,
      filterControls,
      filterLabel = "Filter",
      layersActive = false,
      layersLabel = "Layers",
      moreCount = 0,
      moreLabel,
      notificationsActive = false,
      notificationsLabel = "Notifications",
      onAnalytics,
      onCreate,
      onDisplay,
      onFilter,
      onNotifications,
      onPanel,
      onTabSelect,
      onToggleLayers,
      panelOpen = false,
      panelLabel = "Panel",
      primaryAction,
      selectedTab,
      showSecondaryActions = true,
      tabs,
      title,
      ...props
    },
    ref,
  ) {
    return h(
      "div",
      {
        ...props,
        ref,
        className: cn("border-b border-border bg-surface", className),
      },
      h(
        "div",
        { className: "flex h-12 items-center justify-between border-b border-border px-5" },
        h(
          "div",
          { className: "flex flex-1 items-center justify-center gap-2 text-sm font-semibold" },
          title,
        ),
        primaryAction ??
          h(IconButton, {
            icon: h(Plus, { "aria-hidden": true, className: "size-4" }),
            label: createLabel,
            onClick: onCreate,
            size: "sm",
          }),
      ),
      h(
        "div",
        { className: "flex h-12 items-center gap-2 overflow-x-auto px-5", role: "tablist" },
        tabs.map((tab, index) => {
          const Icon = tab.icon;
          const selected = selectedTab ? tab.value === selectedTab : tab.active;

          return h(ViewTab, {
            controls: tab.controls,
            count: tab.count,
            disabled: tab.disabled,
            icon: Icon ? h(Icon, { "aria-hidden": true, className: "size-4" }) : undefined,
            key: index,
            label: tab.label,
            onClick: () => {
              tab.onSelect?.();
              onTabSelect?.(tab);
            },
            selected,
            value: tab.value,
          });
        }),
        moreCount > 0 || moreLabel
          ? h(Separator, { className: "mx-1 h-6", orientation: "vertical" })
          : null,
        moreCount > 0 || moreLabel
          ? h(
              "span",
              { className: "whitespace-nowrap px-2 text-sm text-muted-foreground" },
              moreLabel ?? `${moreCount} more`,
            )
          : null,
        h(IconButton, {
          "aria-pressed": layersActive,
          className: layersActive ? "bg-subtle text-foreground shadow-card" : undefined,
          icon: h(Layers2, { "aria-hidden": true, className: "size-4" }),
          label: layersLabel,
          onClick: onToggleLayers,
          size: "sm",
        }),
        showSecondaryActions
          ? h(
              "div",
              { className: "ml-auto flex items-center gap-1" },
              h(IconButton, {
                "aria-pressed": notificationsActive,
                className: notificationsActive
                  ? "bg-subtle text-foreground shadow-card"
                  : undefined,
                icon: h(Bell, { "aria-hidden": true, className: "size-4" }),
                label: notificationsLabel,
                onClick: onNotifications,
                size: "sm",
              }),
              h(IconButton, {
                icon: h(BarChart3, { "aria-hidden": true, className: "size-4" }),
                label: analyticsLabel,
                onClick: onAnalytics,
                size: "sm",
              }),
              h(IconButton, {
                "aria-pressed": panelOpen,
                className: panelOpen ? "bg-subtle text-foreground shadow-card" : undefined,
                icon: h(PanelRight, { "aria-hidden": true, className: "size-4" }),
                label: panelLabel,
                onClick: onPanel,
                size: "sm",
              }),
            )
          : null,
      ),
      h(
        "div",
        { className: "flex h-12 items-center gap-3 border-t border-border px-7" },
        h(Filter, { "aria-hidden": true, className: "size-4 text-muted-foreground" }),
        h(
          "button",
          {
            "aria-pressed": filterActive,
            className: cn(
              "rounded px-1 text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              filterActive && "bg-subtle text-primary",
            ),
            onClick: onFilter,
            type: "button",
          },
          filterLabel,
        ),
        filterControls,
        h(
          Button,
          {
            "aria-pressed": displayActive,
            className: cn("ml-auto", displayActive && "ring-1 ring-ring/40"),
            onClick: onDisplay,
            size: "sm",
            variant: "secondary",
          },
          h(SlidersHorizontal, { "aria-hidden": true, className: "size-4" }),
          displayLabel,
        ),
      ),
    );
  },
);
