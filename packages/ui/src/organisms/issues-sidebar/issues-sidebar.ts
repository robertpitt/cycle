import { ChevronDown, Edit3, Search, type LucideIcon } from "lucide-react";
import * as React from "react";

import { BrandMark } from "../../atoms/brand-mark/index.ts";
import { IconButton } from "../../atoms/icon-button/index.ts";
import { cn } from "../../lib/cn.ts";
import { NavigationItem } from "../../molecules/navigation-item/index.ts";

const h = React.createElement;

export type IssuesSidebarItem = {
  readonly active?: boolean;
  readonly count?: React.ReactNode;
  readonly depth?: 0 | 1 | 2;
  readonly disabled?: boolean;
  readonly expanded?: boolean;
  readonly href?: string;
  readonly id?: string;
  readonly icon?: LucideIcon;
  readonly label: React.ReactNode;
  readonly onSelect?: () => void;
  readonly showDisclosure?: boolean;
};

export type IssuesSidebarSection = {
  readonly collapsed?: boolean;
  readonly collapsible?: boolean;
  readonly id?: string;
  readonly items: readonly IssuesSidebarItem[];
  readonly label?: React.ReactNode;
  readonly onToggle?: () => void;
};

export type IssuesSidebarProps = React.HTMLAttributes<HTMLElement> & {
  readonly brandLabel?: string;
  readonly createLabel?: string;
  readonly onCreate?: React.MouseEventHandler<HTMLButtonElement>;
  readonly onItemSelect?: (item: IssuesSidebarItem) => void;
  readonly onSearch?: React.MouseEventHandler<HTMLButtonElement>;
  readonly onSectionToggle?: (section: IssuesSidebarSection) => void;
  readonly searchLabel?: string;
  readonly sections: readonly IssuesSidebarSection[];
};

const getVisibleItems = (items: readonly IssuesSidebarItem[]) => {
  const collapsedDepths: number[] = [];

  return items.filter((item) => {
    const depth = item.depth ?? 0;

    while (
      collapsedDepths.length > 0 &&
      (collapsedDepths[collapsedDepths.length - 1] ?? 0) >= depth
    ) {
      collapsedDepths.pop();
    }

    const hiddenByAncestor = collapsedDepths.some((collapsedDepth) => depth > collapsedDepth);

    if (
      !hiddenByAncestor &&
      (item.showDisclosure || item.expanded !== undefined) &&
      !item.expanded
    ) {
      collapsedDepths.push(depth);
    }

    return !hiddenByAncestor;
  });
};

export const IssuesSidebar = React.forwardRef<HTMLElement, IssuesSidebarProps>(
  function IssuesSidebar(
    {
      brandLabel = "Cycle",
      className,
      createLabel = "Create",
      onCreate,
      onItemSelect,
      onSearch,
      onSectionToggle,
      searchLabel = "Search",
      sections,
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
          "flex min-h-0 flex-col border-r border-border bg-sidebar p-4 text-sidebar-foreground",
          className,
        ),
      },
      h(
        "div",
        { className: "mb-5 flex items-center gap-2" },
        h(BrandMark, { className: "min-w-0 flex-1", label: brandLabel }),
        h(IconButton, {
          icon: h(Search, { "aria-hidden": true, className: "size-4" }),
          label: searchLabel,
          onClick: onSearch,
          size: "sm",
        }),
        h(IconButton, {
          icon: h(Edit3, { "aria-hidden": true, className: "size-4" }),
          label: createLabel,
          onClick: onCreate,
          size: "sm",
          variant: "outline",
        }),
      ),
      h(
        "nav",
        { "aria-label": `${brandLabel} navigation`, className: "min-h-0 overflow-y-auto pr-1" },
        sections.map((section, sectionIndex) => {
          const sectionId = section.id ?? `${String(section.label ?? "section")}-${sectionIndex}`;
          const sectionCollapsed = section.collapsed ?? false;
          const sectionCollapsible = section.collapsible || section.collapsed !== undefined;
          const visibleItems = getVisibleItems(section.items);

          return h(
            "section",
            { className: cn(sectionIndex > 0 && "mt-6"), key: sectionId },
            section.label
              ? sectionCollapsible
                ? h(
                    "button",
                    {
                      "aria-expanded": !sectionCollapsed,
                      className:
                        "mb-2 flex w-full items-center gap-1 rounded px-1 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      onClick: () => {
                        section.onToggle?.();
                        onSectionToggle?.(section);
                      },
                      type: "button",
                    },
                    h(ChevronDown, {
                      "aria-hidden": true,
                      className: cn(
                        "size-3.5 transition-transform",
                        sectionCollapsed && "-rotate-90",
                      ),
                      strokeWidth: 2,
                    }),
                    section.label,
                  )
                : h(
                    "div",
                    {
                      className:
                        "mb-2 flex items-center gap-1 px-1 text-xs font-medium text-muted-foreground",
                    },
                    section.label,
                  )
              : null,
            sectionCollapsed
              ? null
              : h(
                  "div",
                  { className: "grid gap-1" },
                  visibleItems.map((item, itemIndex) => {
                    const Icon = item.icon;

                    return h(NavigationItem, {
                      active: item.active,
                      count: item.count,
                      disabled: item.disabled,
                      depth: item.depth,
                      expanded: item.expanded,
                      href: item.href,
                      icon: Icon
                        ? h(Icon, { "aria-hidden": true, className: "size-4" })
                        : undefined,
                      key: item.id ?? `${String(item.label)}-${itemIndex}`,
                      label: item.label,
                      onNavigate: () => {
                        item.onSelect?.();
                        onItemSelect?.(item);
                      },
                      showDisclosure: item.showDisclosure,
                    });
                  }),
                ),
          );
        }),
      ),
    );
  },
);
