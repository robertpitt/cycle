import { ChevronDown, Plus, Search, type LucideIcon } from "lucide-react";
import * as React from "react";
import { BrandMark } from "../../atoms/brand-mark/index.ts";
import { Button } from "../../atoms/button/index.ts";
import { IconButton } from "../../atoms/icon-button/index.ts";
import { Separator } from "../../atoms/separator/index.ts";
import { cn } from "../../lib/cn.ts";
import { focusRing } from "../../lib/styles.ts";
import { CommandField } from "../../molecules/command-field/index.ts";
import { NavigationItem } from "../../molecules/navigation-item/index.ts";
import { ThemeProvider } from "../../theme/index.ts";
export type WorkspaceNavItem = {
  readonly active?: boolean;
  readonly count?: React.ReactNode;
  readonly disabled?: boolean;
  readonly href?: string;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onSelect?: () => void;
};
export type WorkspaceChildItem = {
  readonly active?: boolean;
  readonly count?: React.ReactNode;
  readonly disabled?: boolean;
  readonly href?: string;
  readonly icon?: LucideIcon;
  readonly id?: string;
  readonly label: string;
  readonly onSelect?: () => void;
};
export type WorkspaceRepositoryStatus = "active" | "attention" | "idle" | "syncing";
export type WorkspaceItem = {
  readonly active?: boolean;
  readonly collapsed?: boolean;
  readonly count?: React.ReactNode;
  readonly disabled?: boolean;
  readonly expanded?: boolean;
  readonly href?: string;
  readonly id?: string;
  readonly items?: readonly WorkspaceChildItem[];
  readonly label: string;
  readonly onSelect?: () => void;
};
export type WorkspaceRepositoryItem = WorkspaceItem & {
  readonly branch?: string;
  readonly color?: "accent" | "primary" | "success" | "warning";
  readonly path?: string;
  readonly status?: WorkspaceRepositoryStatus;
  readonly statusLabel?: string;
};
export type WorkspaceTeamItem = WorkspaceRepositoryItem;
export type WorkspaceShellProps = React.HTMLAttributes<HTMLDivElement> & {
  readonly mode?: "dark" | "light" | "system";
};
export type WorkspaceFrameProps = React.HTMLAttributes<HTMLDivElement>;
export type WorkspaceSidebarProps = React.HTMLAttributes<HTMLElement> & {
  readonly active?: string;
  readonly addWorkspaceLabel?: string;
  readonly brandLabel?: string;
  readonly navItems?: readonly WorkspaceNavItem[];
  readonly onAddWorkspace?: React.MouseEventHandler<HTMLButtonElement>;
  readonly onNavSelect?: (item: WorkspaceNavItem) => void;
  readonly onSearch?: React.MouseEventHandler<HTMLButtonElement>;
  readonly onTeamSelect?: (team: WorkspaceTeamItem) => void;
  readonly onWorkspaceItemSelect?: (item: WorkspaceChildItem, workspace: WorkspaceItem) => void;
  readonly onWorkspaceSelect?: (workspace: WorkspaceItem) => void;
  readonly searchLabel?: string;
  readonly teamLabel?: string;
  readonly teams?: readonly WorkspaceTeamItem[];
  readonly workspaceLabel?: string;
  readonly workspaces?: readonly WorkspaceItem[];
};
export type WorkspaceTopbarProps = React.HTMLAttributes<HTMLDivElement> & {
  readonly createLabel?: string;
  readonly eyebrow: string;
  readonly onCreate?: React.MouseEventHandler<HTMLButtonElement>;
  readonly onSearch?: React.MouseEventHandler<HTMLButtonElement>;
  readonly searchLabel?: string;
  readonly title: string;
};
const getWorkspaceInitials = (label: string) =>
  label
    .split(/[\s.-]+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
const matchesActive = (active: string | undefined, id: string | undefined, label: string) =>
  active === id || active === label;
export const WorkspaceShell = React.forwardRef<HTMLDivElement, WorkspaceShellProps>(
  function WorkspaceShell({ className, mode = "dark", ...props }, ref) {
    return (
      <ThemeProvider
        {...props}
        ref={ref}
        mode={mode}
        className={cn(
          "min-h-screen bg-background text-foreground selection:bg-primary/30 selection:text-primary-foreground",
          className,
        )}
      />
    );
  },
);
export const WorkspaceFrame = React.forwardRef<HTMLDivElement, WorkspaceFrameProps>(
  function WorkspaceFrame({ className, ...props }, ref) {
    return (
      <div
        {...props}
        ref={ref}
        className={cn(
          "mx-auto grid min-h-[820px] overflow-hidden rounded-2xl border border-border bg-surface shadow-elevated lg:grid-cols-[280px_1fr]",
          className,
        )}
      />
    );
  },
);
export const WorkspaceSurface = React.forwardRef<HTMLDivElement, WorkspaceFrameProps>(
  function WorkspaceSurface({ className, ...props }, ref) {
    return (
      <div
        {...props}
        ref={ref}
        className={cn(
          "rounded-xl border border-border bg-elevated text-elevated-foreground shadow-card",
          className,
        )}
      />
    );
  },
);
export const WorkspaceSidebar = React.forwardRef<HTMLElement, WorkspaceSidebarProps>(
  function WorkspaceSidebar(
    {
      active,
      addWorkspaceLabel = "Add workspace",
      brandLabel = "Cycle",
      className,
      navItems = [],
      onAddWorkspace,
      onNavSelect,
      onSearch,
      onTeamSelect,
      onWorkspaceItemSelect,
      onWorkspaceSelect,
      searchLabel = "Search workspace",
      teamLabel,
      teams,
      workspaceLabel,
      workspaces,
      ...props
    },
    ref,
  ) {
    const sidebarWorkspaces = workspaces ?? teams ?? [];
    const sidebarWorkspaceLabel = workspaceLabel ?? teamLabel ?? "Workspaces";
    const showWorkspaceSection = sidebarWorkspaces.length > 0 || onAddWorkspace;
    return (
      <aside
        {...props}
        ref={ref}
        className={cn(
          "border-r border-border bg-sidebar p-4 text-sm text-sidebar-foreground",
          className,
        )}
      >
        <BrandMark label={brandLabel} />
        <CommandField className="mt-5" label={searchLabel} onClick={onSearch} />
        {navItems.length > 0 ? (
          <nav aria-label={`${brandLabel} navigation`} className="mt-5 space-y-1">
            {navItems.map((item) => (
              <NavigationItem
                active={item.active ?? item.label === active}
                count={item.count}
                disabled={item.disabled}
                href={item.href}
                icon={<item.icon aria-hidden className="size-4" strokeWidth={1.8} />}
                key={item.label}
                label={item.label}
                onNavigate={() => {
                  item.onSelect?.();
                  onNavSelect?.(item);
                }}
              />
            ))}
          </nav>
        ) : null}
        {showWorkspaceSection ? <Separator className="my-5" /> : null}
        {showWorkspaceSection ? (
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <p className="text-xs font-medium text-muted-foreground">{sidebarWorkspaceLabel}</p>
            {onAddWorkspace ? (
              <IconButton
                className="size-6 rounded"
                icon={<Plus aria-hidden className="size-3.5" />}
                label={addWorkspaceLabel}
                onClick={onAddWorkspace}
                size="sm"
              />
            ) : null}
          </div>
        ) : null}
        {sidebarWorkspaces.length > 0 ? (
          <div className="grid gap-1">
            {sidebarWorkspaces.map((workspace) => {
              const Element = workspace.href ? "a" : "button";
              const workspaceId = workspace.id ?? workspace.label;
              const workspaceExpanded =
                workspace.expanded ??
                (workspace.collapsed !== undefined ? !workspace.collapsed : true);
              const childItems = workspace.items ?? [];
              const hasChildItems = childItems.length > 0;
              const workspaceActive =
                workspace.active ??
                (matchesActive(active, workspace.id, workspace.label) ||
                  childItems.some((item) => {
                    const itemId = item.id ?? item.label;
                    return (
                      item.active ??
                      (matchesActive(active, item.id, item.label) ||
                        active === `${workspaceId}:${itemId}`)
                    );
                  }));
              return (
                <div className="grid gap-1" key={workspaceId}>
                  <Element
                    aria-current={workspaceActive ? "page" : undefined}
                    aria-disabled={workspace.href && workspace.disabled ? true : undefined}
                    aria-expanded={hasChildItems ? workspaceExpanded : undefined}
                    className={cn(
                      "group flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground",
                      focusRing,
                      workspaceActive && "bg-subtle text-foreground",
                      workspace.disabled && "pointer-events-none cursor-not-allowed opacity-45",
                    )}
                    data-state={workspaceActive ? "active" : "inactive"}
                    href={workspace.disabled ? undefined : workspace.href}
                    onClick={(event: React.MouseEvent<HTMLElement>) => {
                      if (workspace.disabled) {
                        event.preventDefault();
                        return;
                      }
                      workspace.onSelect?.();
                      onWorkspaceSelect?.(workspace);
                      onTeamSelect?.(workspace as WorkspaceTeamItem);
                    }}
                    tabIndex={workspace.href && workspace.disabled ? -1 : undefined}
                    type={workspace.href ? undefined : "button"}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded-md bg-muted text-[11px] font-semibold text-muted-foreground transition-colors group-hover:text-foreground",
                        workspaceActive && "bg-primary/15 text-primary",
                      )}
                    >
                      {getWorkspaceInitials(workspace.label)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {workspace.label}
                    </span>
                    {workspace.count !== undefined && workspace.count !== null ? (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {workspace.count}
                      </span>
                    ) : null}
                    {hasChildItems ? (
                      <ChevronDown
                        aria-hidden
                        className={cn(
                          "size-3.5 shrink-0 text-muted-foreground transition-transform",
                          workspaceExpanded && "rotate-180",
                        )}
                        strokeWidth={2}
                      />
                    ) : null}
                  </Element>
                  {workspaceExpanded && childItems.length > 0 ? (
                    <div className="grid gap-1">
                      {childItems.map((item) => {
                        const itemId = item.id ?? item.label;
                        const itemActive =
                          item.active ??
                          (matchesActive(active, item.id, item.label) ||
                            active === `${workspaceId}:${itemId}`);
                        const Icon = item.icon;
                        return (
                          <NavigationItem
                            active={itemActive}
                            count={item.count}
                            disabled={item.disabled}
                            depth={1}
                            href={item.href}
                            icon={
                              Icon ? (
                                <Icon aria-hidden className="size-4" strokeWidth={1.8} />
                              ) : undefined
                            }
                            key={itemId}
                            label={item.label}
                            onNavigate={() => {
                              item.onSelect?.();
                              onWorkspaceItemSelect?.(item, workspace);
                            }}
                          />
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </aside>
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
    return (
      <div
        {...props}
        ref={ref}
        className={cn(
          "flex items-center justify-between border-b border-border px-7 py-5",
          className,
        )}
      >
        <div>
          <p className="text-sm text-muted-foreground">{eyebrow}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={onSearch} size="sm" variant="outline">
            <Search aria-hidden className="size-4" />
            {searchLabel}
          </Button>
          <Button onClick={onCreate} size="sm">
            <Plus aria-hidden className="size-4" />
            {createLabel}
          </Button>
        </div>
      </div>
    );
  },
);
