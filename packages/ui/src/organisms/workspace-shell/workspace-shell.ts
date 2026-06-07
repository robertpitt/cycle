import { Plus, Search, type LucideIcon } from "lucide-react";
import * as React from "react";

import { BrandMark } from "../../atoms/brand-mark/index.ts";
import { Button } from "../../atoms/button/index.ts";
import { Separator } from "../../atoms/separator/index.ts";
import { cn } from "../../lib/cn.ts";
import { focusRing } from "../../lib/styles.ts";
import { CommandField } from "../../molecules/command-field/index.ts";
import { NavigationItem } from "../../molecules/navigation-item/index.ts";
import { ThemeProvider } from "../../theme/index.ts";

const h = React.createElement;

export type WorkspaceNavItem = {
  readonly active?: boolean;
  readonly count?: React.ReactNode;
  readonly disabled?: boolean;
  readonly href?: string;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onSelect?: () => void;
};

export type WorkspaceTeamItem = {
  readonly color?: "accent" | "primary" | "success" | "warning";
  readonly disabled?: boolean;
  readonly label: string;
  readonly onSelect?: () => void;
};

export type WorkspaceShellProps = React.HTMLAttributes<HTMLDivElement> & {
  readonly mode?: "dark" | "light" | "system";
};

export type WorkspaceFrameProps = React.HTMLAttributes<HTMLDivElement>;

export type WorkspaceSidebarProps = React.HTMLAttributes<HTMLElement> & {
  readonly active?: string;
  readonly brandLabel?: string;
  readonly navItems: readonly WorkspaceNavItem[];
  readonly onNavSelect?: (item: WorkspaceNavItem) => void;
  readonly onSearch?: React.MouseEventHandler<HTMLButtonElement>;
  readonly onTeamSelect?: (team: WorkspaceTeamItem) => void;
  readonly searchLabel?: string;
  readonly teamLabel?: string;
  readonly teams?: readonly WorkspaceTeamItem[];
};

export type WorkspaceTopbarProps = React.HTMLAttributes<HTMLDivElement> & {
  readonly createLabel?: string;
  readonly eyebrow: string;
  readonly onCreate?: React.MouseEventHandler<HTMLButtonElement>;
  readonly onSearch?: React.MouseEventHandler<HTMLButtonElement>;
  readonly searchLabel?: string;
  readonly title: string;
};

const teamColorClassName = {
  accent: "bg-accent",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
} satisfies Record<NonNullable<WorkspaceTeamItem["color"]>, string>;

export const WorkspaceShell = React.forwardRef<HTMLDivElement, WorkspaceShellProps>(
  function WorkspaceShell({ className, mode = "dark", ...props }, ref) {
    return h(ThemeProvider, {
      ...props,
      ref,
      mode,
      className: cn(
        "min-h-screen bg-background text-foreground selection:bg-primary/30 selection:text-primary-foreground",
        className,
      ),
    });
  },
);

export const WorkspaceFrame = React.forwardRef<HTMLDivElement, WorkspaceFrameProps>(
  function WorkspaceFrame({ className, ...props }, ref) {
    return h("div", {
      ...props,
      ref,
      className: cn(
        "mx-auto grid min-h-[820px] overflow-hidden rounded-2xl border border-border bg-surface shadow-elevated lg:grid-cols-[240px_1fr]",
        className,
      ),
    });
  },
);

export const WorkspaceSurface = React.forwardRef<HTMLDivElement, WorkspaceFrameProps>(
  function WorkspaceSurface({ className, ...props }, ref) {
    return h("div", {
      ...props,
      ref,
      className: cn(
        "rounded-xl border border-border bg-elevated text-elevated-foreground shadow-card",
        className,
      ),
    });
  },
);

export const WorkspaceSidebar = React.forwardRef<HTMLElement, WorkspaceSidebarProps>(
  function WorkspaceSidebar(
    {
      active,
      brandLabel = "Cycle",
      className,
      navItems,
      onNavSelect,
      onSearch,
      onTeamSelect,
      searchLabel = "Search",
      teamLabel = "Teams",
      teams = [],
      ...props
    },
    ref,
  ) {
    return h(
      "aside",
      {
        ...props,
        ref,
        className: cn(
          "border-r border-border bg-sidebar p-4 text-sm text-sidebar-foreground",
          className,
        ),
      },
      h(BrandMark, { label: brandLabel }),
      h(CommandField, { className: "mt-5", label: searchLabel, onClick: onSearch }),
      h(
        "nav",
        { "aria-label": `${brandLabel} navigation`, className: "mt-5 space-y-1" },
        navItems.map((item) =>
          h(NavigationItem, {
            active: item.active ?? item.label === active,
            count: item.count,
            disabled: item.disabled,
            href: item.href,
            icon: h(item.icon, {
              "aria-hidden": true,
              className: "size-4",
              strokeWidth: 1.8,
            }),
            key: item.label,
            label: item.label,
            onNavigate: () => {
              item.onSelect?.();
              onNavSelect?.(item);
            },
          }),
        ),
      ),
      teams.length > 0 ? h(Separator, { className: "my-5" }) : null,
      teams.length > 0
        ? h("p", { className: "mb-2 px-2 text-xs text-muted-foreground" }, teamLabel)
        : null,
      teams.map((team, index) =>
        h(
          "button",
          {
            "aria-disabled": team.disabled ? true : undefined,
            className: cn(
              "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground",
              focusRing,
              team.disabled && "pointer-events-none cursor-not-allowed opacity-45",
            ),
            key: team.label,
            onClick: () => {
              if (team.disabled) {
                return;
              }

              team.onSelect?.();
              onTeamSelect?.(team);
            },
            type: "button",
          },
          h("span", {
            "aria-hidden": true,
            className: cn(
              "size-2 rounded-full",
              teamColorClassName[
                team.color ?? (index === 0 ? "primary" : index === 1 ? "accent" : "success")
              ],
            ),
          }),
          team.label,
        ),
      ),
    );
  },
);

export const WorkspaceTopbar = React.forwardRef<HTMLDivElement, WorkspaceTopbarProps>(
  function WorkspaceTopbar(
    {
      className,
      createLabel = "Create",
      eyebrow,
      onCreate,
      onSearch,
      searchLabel = "Search",
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
        className: cn(
          "flex items-center justify-between border-b border-border px-7 py-5",
          className,
        ),
      },
      h(
        "div",
        null,
        h("p", { className: "text-sm text-muted-foreground" }, eyebrow),
        h("h1", { className: "mt-1 text-2xl font-semibold tracking-normal" }, title),
      ),
      h(
        "div",
        { className: "flex items-center gap-2" },
        h(
          Button,
          { onClick: onSearch, size: "sm", variant: "outline" },
          h(Search, { "aria-hidden": true, className: "size-4" }),
          searchLabel,
        ),
        h(
          Button,
          { onClick: onCreate, size: "sm" },
          h(Plus, { "aria-hidden": true, className: "size-4" }),
          createLabel,
        ),
      ),
    );
  },
);
