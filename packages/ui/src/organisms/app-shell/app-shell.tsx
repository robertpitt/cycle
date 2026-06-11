import { Bell, PanelLeftClose, PanelLeftOpen, Plus, Settings } from "lucide-react";
import * as React from "react";
import { BrandMark } from "../../atoms/brand-mark/index.ts";
import { Button } from "../../atoms/button/index.ts";
import { IconButton } from "../../atoms/icon-button/index.ts";
import { Separator } from "../../atoms/separator/index.ts";
import { cn } from "../../lib/cn.ts";
import { CommandField } from "../../molecules/command-field/index.ts";
import { NavigationItem } from "../../molecules/navigation-item/index.ts";
import { ShellSidebarSection } from "../../molecules/shell-sidebar-section/index.ts";

export type AppShellNavItem = {
  readonly active?: boolean;
  readonly badge?: React.ReactNode;
  readonly className?: string;
  readonly depth?: 0 | 1 | 2;
  readonly disabled?: boolean;
  readonly expanded?: boolean;
  readonly href?: string;
  readonly icon?: React.ReactNode;
  readonly id: string;
  readonly label: string;
  readonly onSelect?: () => void;
  readonly showDisclosure?: boolean;
};

export type AppShellNavSection = {
  readonly action?: React.ReactNode;
  readonly id: string;
  readonly items: readonly AppShellNavItem[];
  readonly title: string;
};

export type AppShellRootProps = React.HTMLAttributes<HTMLDivElement>;

export type AppShellFrameProps = React.HTMLAttributes<HTMLDivElement> & {
  readonly collapsed?: boolean;
};

export type AppShellSidebarProps = React.HTMLAttributes<HTMLElement> & {
  readonly activeItemId?: string;
  readonly brandLabel?: string;
  readonly collapsed?: boolean;
  readonly createLabel?: string;
  readonly footer?: React.ReactNode;
  readonly navSections?: readonly AppShellNavSection[];
  readonly onCreate?: React.MouseEventHandler<HTMLButtonElement>;
  readonly onNavItemSelect?: (item: AppShellNavItem, section: AppShellNavSection) => void;
  readonly onSearch?: React.MouseEventHandler<HTMLButtonElement>;
  readonly onSettingsSelect?: () => void;
  readonly settingsActive?: boolean;
  readonly settingsLabel?: string;
};

export type AppShellHeaderProps = React.HTMLAttributes<HTMLElement> & {
  readonly actions?: React.ReactNode;
  readonly breadcrumb?: React.ReactNode;
  readonly collapsed?: boolean;
  readonly onToggleSidebar?: React.MouseEventHandler<HTMLButtonElement>;
  readonly subtitle?: React.ReactNode;
  readonly title: React.ReactNode;
};

export type AppShellMainProps = React.HTMLAttributes<HTMLElement>;

export type AppShellFooterProps = React.HTMLAttributes<HTMLElement> & {
  readonly left?: React.ReactNode;
  readonly right?: React.ReactNode;
};

const getFallbackIcon = (label: string, collapsed: boolean) => (
  <span
    aria-hidden
    className={cn(
      "grid size-4 place-items-center rounded-sm border border-border bg-muted text-[10px] font-semibold text-muted-foreground",
      collapsed && "size-5 rounded-md",
    )}
  >
    {collapsed ? label.slice(0, 1).toUpperCase() : null}
  </span>
);

export const AppShellRoot = React.forwardRef<HTMLDivElement, AppShellRootProps>(
  function AppShellRoot({ className, ...props }, ref) {
    return (
      <div
        {...props}
        ref={ref}
        className={cn(
          "min-h-screen overflow-hidden bg-background text-foreground selection:bg-primary/25",
          className,
        )}
      />
    );
  },
);

export const AppShellFrame = React.forwardRef<HTMLDivElement, AppShellFrameProps>(
  function AppShellFrame({ className, collapsed = false, ...props }, ref) {
    return (
      <div
        {...props}
        ref={ref}
        className={cn(
          "grid min-h-screen grid-cols-[280px_minmax(0,1fr)] bg-background transition-[grid-template-columns]",
          collapsed && "grid-cols-[72px_minmax(0,1fr)]",
          className,
        )}
      />
    );
  },
);

export const AppShellSidebar = React.forwardRef<HTMLElement, AppShellSidebarProps>(
  function AppShellSidebar(
    {
      activeItemId,
      brandLabel = "Cycle",
      className,
      collapsed = false,
      createLabel = "Create",
      footer,
      navSections = [],
      onCreate,
      onNavItemSelect,
      onSearch,
      onSettingsSelect,
      settingsActive = false,
      settingsLabel = "Settings",
      ...props
    },
    ref,
  ) {
    return (
      <aside
        {...props}
        ref={ref}
        className={cn(
          "grid h-full min-h-0 grid-rows-[auto_1fr_auto] border-r border-border bg-sidebar text-sidebar-foreground",
          collapsed ? "p-3" : "p-4",
          className,
        )}
      >
        <div className={cn("grid gap-4", collapsed && "justify-items-center")}>
          <BrandMark label={brandLabel} showLabel={!collapsed} />
          {collapsed ? (
            <IconButton
              icon={getFallbackIcon("Search", true)}
              label="Search"
              onClick={onSearch}
              size="sm"
              title="Search"
              variant="outline"
            />
          ) : (
            <CommandField label="Search" onClick={onSearch} shortcut="K" />
          )}
        </div>

        <nav
          aria-label={`${brandLabel} navigation`}
          className={cn("mt-5 grid content-start gap-5 overflow-y-auto", collapsed && "gap-4")}
        >
          {navSections.map((section) => (
            <ShellSidebarSection
              action={section.action}
              collapsed={collapsed}
              key={section.id}
              title={section.title}
            >
              <div className={cn("grid gap-1", collapsed && "justify-items-center")}>
                {section.items.map((item) => {
                  const active = item.active ?? item.id === activeItemId;

                  return (
                    <NavigationItem
                      active={active}
                      className={cn(
                        collapsed &&
                          "size-9 justify-center rounded-lg px-0 [&>span:not(:first-child)]:sr-only",
                        item.className,
                      )}
                      count={collapsed ? undefined : item.badge}
                      disabled={item.disabled}
                      depth={item.depth}
                      expanded={item.expanded}
                      href={item.href}
                      icon={
                        item.icon ??
                        (collapsed ? getFallbackIcon(item.label, collapsed) : undefined)
                      }
                      key={item.id}
                      label={collapsed ? <span>{item.label}</span> : item.label}
                      onNavigate={() => {
                        item.onSelect?.();
                        onNavItemSelect?.(item, section);
                      }}
                      showDisclosure={!collapsed && item.showDisclosure}
                      title={item.label}
                    />
                  );
                })}
              </div>
            </ShellSidebarSection>
          ))}
        </nav>

        <div className={cn("grid gap-3", collapsed && "justify-items-center")}>
          <Separator />
          {footer ? (
            footer
          ) : (
            <NavigationItem
              active={settingsActive}
              className={cn(
                collapsed &&
                  "size-9 justify-center rounded-lg px-0 [&>span:not(:first-child)]:sr-only",
              )}
              icon={<Settings aria-hidden className="size-4" />}
              label={collapsed ? <span>{settingsLabel}</span> : settingsLabel}
              onNavigate={onSettingsSelect}
              title={settingsLabel}
            />
          )}
          {onCreate ? (
            <Button
              className={cn(collapsed && "size-9 px-0")}
              leftIcon={<Plus aria-hidden className="size-4" />}
              onClick={onCreate}
              size="sm"
              title={createLabel}
            >
              {collapsed ? <span className="sr-only">{createLabel}</span> : createLabel}
            </Button>
          ) : null}
        </div>
      </aside>
    );
  },
);

export const AppShellHeader = React.forwardRef<HTMLElement, AppShellHeaderProps>(
  function AppShellHeader(
    {
      actions,
      breadcrumb,
      className,
      collapsed = false,
      onToggleSidebar,
      subtitle,
      title,
      ...props
    },
    ref,
  ) {
    return (
      <header
        {...props}
        ref={ref}
        className={cn(
          "flex min-h-14 items-center justify-between gap-4 border-b border-border bg-surface px-5",
          className,
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          {onToggleSidebar ? (
            <IconButton
              aria-pressed={collapsed}
              icon={
                collapsed ? (
                  <PanelLeftOpen aria-hidden className="size-4" />
                ) : (
                  <PanelLeftClose aria-hidden className="size-4" />
                )
              }
              label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={onToggleSidebar}
              size="sm"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              variant="outline"
            />
          ) : null}
          <div className="min-w-0">
            {breadcrumb ? (
              <div className="truncate text-xs text-muted-foreground">{breadcrumb}</div>
            ) : null}
            <h1 className="truncate text-base font-semibold tracking-normal">{title}</h1>
            {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions ?? (
            <>
              <IconButton
                icon={<Bell aria-hidden className="size-4" />}
                label="Notifications"
                size="sm"
                title="Notifications"
              />
              <Button leftIcon={<Plus aria-hidden className="size-4" />} size="sm">
                New
              </Button>
            </>
          )}
        </div>
      </header>
    );
  },
);

export const AppShellMain = React.forwardRef<HTMLElement, AppShellMainProps>(function AppShellMain(
  { className, ...props },
  ref,
) {
  return <main {...props} ref={ref} className={cn("min-h-0 overflow-auto", className)} />;
});

export const AppShellFooter = React.forwardRef<HTMLElement, AppShellFooterProps>(
  function AppShellFooter({ children, className, left, right, ...props }, ref) {
    return (
      <footer
        {...props}
        ref={ref}
        className={cn(
          "flex min-h-8 items-center justify-between gap-3 border-t border-border bg-surface px-4 text-xs text-muted-foreground",
          className,
        )}
      >
        {children ?? (
          <>
            <div className="min-w-0 truncate">{left}</div>
            <div className="min-w-0 truncate text-right">{right}</div>
          </>
        )}
      </footer>
    );
  },
);
