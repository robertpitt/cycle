import { Separator } from "@cycle/ui/atoms";
import { NavigationItem } from "@cycle/ui/molecules";
import type { AppShellNavSection } from "@cycle/ui/organisms";
import { ArrowLeft, Settings } from "lucide-react";

type SettingsSidebarProps = {
  readonly activeItemId?: string;
  readonly navSections: readonly AppShellNavSection[];
  readonly onBack: () => void;
  readonly onNavItemSelect: (item: AppShellNavSection["items"][number]) => void;
};

export const SettingsSidebar = ({
  activeItemId,
  navSections,
  onBack,
  onNavItemSelect,
}: SettingsSidebarProps) => (
  <aside className="grid h-full min-h-0 grid-rows-[auto_1fr_auto] border-r border-border bg-sidebar p-4 text-sidebar-foreground">
    <div className="flex h-9 items-center gap-3 px-1">
      <span
        aria-hidden
        className="grid size-8 place-items-center rounded-lg border border-border bg-muted text-muted-foreground"
      >
        <Settings className="size-4" />
      </span>
      <span className="truncate text-sm font-semibold tracking-normal">Settings</span>
    </div>

    <nav
      aria-label="Settings navigation"
      className="-mx-1 mt-5 grid content-start gap-5 overflow-y-auto px-1 py-1"
    >
      {navSections.map((section) => (
        <section className="grid gap-2" key={section.id}>
          <div className="flex h-6 items-center justify-between gap-2 px-2">
            <h4 className="truncate text-[13px] font-semibold text-foreground">{section.title}</h4>
            {section.action ? <div className="shrink-0">{section.action}</div> : null}
          </div>
          <div className="grid gap-1">
            {section.items.map((item) => (
              <NavigationItem
                active={item.active ?? item.id === activeItemId}
                className={item.className}
                count={item.badge}
                disabled={item.disabled}
                depth={item.depth}
                expanded={item.expanded}
                href={item.href}
                icon={item.icon}
                key={item.id}
                label={item.label}
                onNavigate={() => {
                  item.onSelect?.();
                  onNavItemSelect(item);
                }}
                showDisclosure={item.showDisclosure}
                title={item.label}
              />
            ))}
          </div>
        </section>
      ))}
    </nav>

    <div className="grid gap-3">
      <Separator />
      <NavigationItem
        icon={<ArrowLeft aria-hidden className="size-4" />}
        label="Back to workspace"
        onNavigate={onBack}
        title="Back to workspace"
      />
    </div>
  </aside>
);
