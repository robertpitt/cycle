import { Separator } from "@cycle/ui/atoms";
import { NavigationItem, ShellSidebarSection } from "@cycle/ui/molecules";
import type { AppShellNavSection } from "@cycle/ui/organisms";
import { cn } from "@cycle/ui/utils";
import { ArrowLeft, Settings } from "lucide-react";

type SettingsSidebarProps = {
  readonly activeItemId?: string;
  readonly collapsed?: boolean;
  readonly id?: string;
  readonly navSections: readonly AppShellNavSection[];
  readonly onBack: () => void;
  readonly onNavItemSelect: (item: AppShellNavSection["items"][number]) => void;
};

export const SettingsSidebar = ({
  activeItemId,
  collapsed = false,
  id,
  navSections,
  onBack,
  onNavItemSelect,
}: SettingsSidebarProps) => (
  <aside
    className={cn(
      "grid h-full min-h-0 grid-rows-[auto_1fr_auto] border-r border-border bg-sidebar text-sidebar-foreground",
      collapsed ? "p-3" : "p-4",
    )}
    id={id}
  >
    <div className={cn("flex h-9 items-center gap-3 px-1", collapsed && "justify-center")}>
      <span
        aria-hidden
        className="grid size-8 place-items-center rounded-lg border border-border bg-muted text-muted-foreground"
      >
        <Settings className="size-4" />
      </span>
      <span
        className={cn("truncate text-sm font-semibold tracking-normal", collapsed && "sr-only")}
      >
        Settings
      </span>
    </div>

    <nav
      aria-label="Settings navigation"
      className={cn(
        "-mx-1 mt-5 grid content-start gap-5 overflow-y-auto px-1 py-1",
        collapsed && "gap-4",
      )}
    >
      {navSections.map((section) => (
        <ShellSidebarSection
          action={section.action}
          collapsed={collapsed}
          key={section.id}
          title={section.title}
        >
          <div className={cn("grid gap-1", collapsed && "justify-items-center")}>
            {section.items.map((item) => (
              <NavigationItem
                active={item.active ?? item.id === activeItemId}
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
                icon={item.icon}
                key={item.id}
                label={collapsed ? <span>{item.label}</span> : item.label}
                onNavigate={() => {
                  item.onSelect?.();
                  onNavItemSelect(item);
                }}
                showDisclosure={!collapsed && item.showDisclosure}
                title={item.label}
              />
            ))}
          </div>
        </ShellSidebarSection>
      ))}
    </nav>

    <div className={cn("grid gap-3", collapsed && "justify-items-center")}>
      <Separator />
      <NavigationItem
        className={cn(
          collapsed && "size-9 justify-center rounded-lg px-0 [&>span:not(:first-child)]:sr-only",
        )}
        icon={<ArrowLeft aria-hidden className="size-4" />}
        label={collapsed ? <span>Back to workspace</span> : "Back to workspace"}
        onNavigate={onBack}
        title="Back to workspace"
      />
    </div>
  </aside>
);
