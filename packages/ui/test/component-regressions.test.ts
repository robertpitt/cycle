import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Badge } from "../src/atoms/badge/index.ts";
import { BrandMark } from "../src/atoms/brand-mark/index.ts";
import { DateTime } from "../src/atoms/date-time/index.ts";
import { Spinner } from "../src/atoms/spinner/index.ts";
import { StatusIndicator } from "../src/atoms/status-indicator/index.ts";
import {
  normalizeOtpLength,
  normalizeOtpValue,
  pasteOtpDigits,
  removeOtpDigit,
  replaceOtpDigit,
} from "../src/internal/otp-code.ts";
import { isAriaInvalid } from "../src/lib/contracts.ts";
import { ChipSelect } from "../src/molecules/chip-select/index.ts";
import { IssueGroupHeader } from "../src/molecules/issue-group-header/index.ts";
import { IssueListRow } from "../src/molecules/issue-list-row/index.ts";
import { IssueResourceLink } from "../src/molecules/issue-resource-link/index.ts";
import { NavigationItem } from "../src/molecules/navigation-item/index.ts";
import { PanelState } from "../src/molecules/panel-state/index.ts";
import { PropertyPicker } from "../src/molecules/property-picker/index.ts";
import { SettingRow } from "../src/molecules/setting-row/index.ts";
import {
  AppShellFrame,
  AppShellHeader,
  AppShellSidebar,
} from "../src/organisms/app-shell/index.ts";
import { ViewIssue } from "../src/organisms/view-issue/index.ts";

describe("component regressions", () => {
  it("keeps semantic badge tones in outline appearance", () => {
    const markup = renderToStaticMarkup(
      createElement(Badge, { appearance: "outline", children: "Blocked", tone: "danger" }),
    );

    expect(markup).toContain("border-destructive/35");
    expect(markup).toContain("bg-transparent");
    expect(markup).toContain("text-destructive");
    expect(markup).not.toContain("text-muted-foreground");
  });

  it("keeps ring status indicators transparent", () => {
    const markup = renderToStaticMarkup(
      createElement(StatusIndicator, { shape: "ring", tone: "success" }),
    );

    expect(markup).toContain("border-success");
    expect(markup).toContain("bg-transparent");
    expect(markup).not.toContain("bg-success");
  });

  it("normalizes all valid aria-invalid values", () => {
    expect(isAriaInvalid(true)).toBe(true);
    expect(isAriaInvalid("grammar")).toBe(true);
    expect(isAriaInvalid("spelling")).toBe(true);
    expect(isAriaInvalid(false)).toBe(false);
    expect(isAriaInvalid("false")).toBe(false);
  });

  it("gives an icon-only brand mark an accessible name", () => {
    const markup = renderToStaticMarkup(
      createElement(BrandMark, { label: "Cycle", showLabel: false }),
    );

    expect(markup).toContain('aria-label="Cycle"');
    expect(markup).toContain('role="img"');
  });

  it("keeps collapsed app navigation named, focusable, and context-rich", () => {
    const markup = renderToStaticMarkup(
      createElement(AppShellSidebar, {
        activeItemId: "issues",
        collapsed: true,
        id: "app-navigation-sidebar",
        navSections: [
          {
            id: "workspace",
            items: [{ id: "issues", label: "Issues" }],
            title: "Workspace",
          },
        ],
      }),
    );

    expect(markup).toContain('id="app-navigation-sidebar"');
    expect(markup).toContain('aria-label="Cycle navigation"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('title="Issues"');
    expect(markup).toContain(">Issues</span>");
    expect(markup).toContain("size-9 justify-center");
  });

  it("exposes sidebar toggle state and shortcut context", () => {
    const collapsedHeader = renderToStaticMarkup(
      createElement(AppShellHeader, {
        collapsed: true,
        onToggleSidebar: () => undefined,
        sidebarId: "app-navigation-sidebar",
        sidebarShortcut: "⌘B",
        sidebarShortcutKeys: "Meta+B",
        title: "Issues",
      }),
    );
    const expandedHeader = renderToStaticMarkup(
      createElement(AppShellHeader, {
        collapsed: false,
        onToggleSidebar: () => undefined,
        sidebarId: "app-navigation-sidebar",
        sidebarShortcut: "⌘B",
        sidebarShortcutKeys: "Meta+B",
        title: "Issues",
      }),
    );

    expect(collapsedHeader).toContain('aria-label="Expand sidebar"');
    expect(collapsedHeader).toContain('aria-controls="app-navigation-sidebar"');
    expect(collapsedHeader).toContain('aria-expanded="false"');
    expect(collapsedHeader).toContain('aria-keyshortcuts="Meta+B"');
    expect(collapsedHeader).toContain('title="Expand sidebar (⌘B)"');
    expect(expandedHeader).toContain('aria-label="Collapse sidebar"');
    expect(expandedHeader).toContain('aria-expanded="true"');
  });

  it("adapts app-shell columns for expanded and collapsed navigation", () => {
    const expanded = renderToStaticMarkup(createElement(AppShellFrame));
    const collapsed = renderToStaticMarkup(createElement(AppShellFrame, { collapsed: true }));

    expect(expanded).toContain("grid-cols-[280px_minmax(0,1fr)]");
    expect(collapsed).toContain("grid-cols-[72px_minmax(0,1fr)]");
    expect(collapsed).toContain("transition-[grid-template-columns]");
  });

  it("preserves fallback attributes for invalid dates", () => {
    const markup = renderToStaticMarkup(
      createElement(DateTime, {
        "aria-label": "Last updated",
        fallback: "Unknown",
        id: "last-updated",
        value: "not-a-date",
      }),
    );

    expect(markup).toContain('aria-label="Last updated"');
    expect(markup).toContain('id="last-updated"');
    expect(markup).toContain(">Unknown</span>");
  });

  it("filters chip-select options using its controlled search foundation", () => {
    const markup = renderToStaticMarkup(
      createElement(ChipSelect, {
        defaultOpen: true,
        defaultSearchValue: "complete",
        searchPlaceholder: "Filter status",
        sections: [
          {
            id: "status",
            options: [
              { id: "todo", label: "Todo" },
              { id: "done", label: "Done", searchText: "complete finished" },
            ],
          },
        ],
        triggerLabel: "Status",
      }),
    );

    expect(markup).toContain(">Done</span>");
    expect(markup).not.toContain(">Todo</span>");
  });

  it("treats the property picker value as the source of selected state", () => {
    const markup = renderToStaticMarkup(
      createElement(PropertyPicker, {
        defaultOpen: true,
        sections: [
          {
            id: "status",
            options: [{ id: "todo", label: "Todo", selected: false }],
          },
        ],
        value: "todo",
      }),
    );

    expect(markup).toContain('aria-selected="true"');
  });

  it("does not render action controls without action callbacks", () => {
    const headerMarkup = renderToStaticMarkup(
      createElement(IssueGroupHeader, { title: "Backlog" }),
    );
    const resourceMarkup = renderToStaticMarkup(
      createElement(IssueResourceLink, { title: "Design notes" }),
    );

    expect(headerMarkup).not.toContain("<button");
    expect(resourceMarkup).not.toContain("<button");
  });

  it("makes disabled setting rows inert", () => {
    const markup = renderToStaticMarkup(
      createElement(SettingRow, {
        control: createElement("button", { children: "Change" }),
        disabled: true,
        title: "Repository access",
      }),
    );

    expect(markup).toContain('inert=""');
  });

  it("renders disabled navigation buttons as native disabled controls", () => {
    const markup = renderToStaticMarkup(
      createElement(NavigationItem, { disabled: true, label: "Settings" }),
    );

    expect(markup).toContain("<button");
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('type="button"');
  });

  it("uses button-compatible selected semantics for interactive rows", () => {
    const markup = renderToStaticMarkup(
      createElement(IssueListRow, {
        id: "CYC-42",
        meta: [{ label: "Hidden" }],
        metaLimit: -1,
        onSelect: () => undefined,
        selected: true,
        title: "Keep row interactions predictable",
        updateCount: 0,
      }),
    );

    expect(markup).toContain('aria-pressed="true"');
    expect(markup).not.toContain("Hidden");
    expect(markup).toContain(">0</span>");
  });

  it("announces panel loading and errors without nested spinner statuses", () => {
    const loadingMarkup = renderToStaticMarkup(
      createElement(PanelState, { kind: "loading", message: "Loading issues" }),
    );
    const errorMarkup = renderToStaticMarkup(
      createElement(PanelState, { kind: "error", message: "Issues could not be loaded" }),
    );
    const decorativeSpinnerMarkup = renderToStaticMarkup(
      createElement(Spinner, { decorative: true }),
    );

    expect(loadingMarkup.match(/role="status"/gu)).toHaveLength(1);
    expect(loadingMarkup).toContain('aria-busy="true"');
    expect(errorMarkup).toContain('role="alert"');
    expect(errorMarkup).toContain("text-destructive");
    expect(decorativeSpinnerMarkup).not.toContain('role="status"');
  });

  it("renders sub-issues and each ticket relationship group", () => {
    const markup = renderToStaticMarkup(
      createElement(ViewIssue, {
        defaultDescription: "Ticket body",
        defaultTitle: "Relationship visibility",
        dependencyState: {
          blocked: true,
          blockingTickets: [{ id: "CYC-2", status: "todo", title: "Prerequisite" }],
          dependencyTickets: [{ id: "CYC-2", status: "todo", title: "Prerequisite" }],
          downstreamBlockedTickets: [{ id: "CYC-3", status: "backlog", title: "Dependent" }],
          downstreamTickets: [{ id: "CYC-3", status: "backlog", title: "Dependent" }],
          relatedTickets: [{ id: "CYC-4", status: "backlog", title: "Related work" }],
          warnings: [],
        },
        subIssues: [{ id: "CYC-5", status: "todo", title: "Child ticket" }],
      }),
    );

    expect(markup).toContain("Sub-issues");
    expect(markup).toContain("Child ticket");
    expect(markup).toContain("Relationships");
    expect(markup).toContain("Depends on");
    expect(markup).toContain("Blocks");
    expect(markup).toContain("Related work");
  });
});

describe("OTP value operations", () => {
  it("normalizes values and invalid lengths", () => {
    expect(normalizeOtpLength(0)).toBe(1);
    expect(normalizeOtpLength(4.8)).toBe(4);
    expect(normalizeOtpValue("1a2 34", 4)).toBe("1234");
  });

  it("replaces populated digits instead of duplicating them", () => {
    expect(replaceOtpDigit("1234", 1, "29", 4)).toBe("1934");
  });

  it("removes the selected digit and shifts the remaining value", () => {
    expect(replaceOtpDigit("1234", 1, "", 4)).toBe("134");
    expect(removeOtpDigit("1234", 2, 4)).toBe("124");
  });

  it("pastes consecutive digits without exceeding the field length", () => {
    expect(pasteOtpDigits("1234", 1, "987", 4)).toBe("1987");
    expect(pasteOtpDigits("12", 2, "34567", 4)).toBe("1234");
  });
});
