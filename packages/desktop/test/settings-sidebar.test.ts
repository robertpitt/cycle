import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SettingsSidebar } from "../src/renderer/components/SettingsSidebar.tsx";

describe("SettingsSidebar", () => {
  it("keeps settings navigation operable and named when collapsed", () => {
    const markup = renderToStaticMarkup(
      createElement(SettingsSidebar, {
        activeItemId: "settings:general",
        collapsed: true,
        id: "app-navigation-sidebar",
        navSections: [
          {
            id: "application",
            items: [
              {
                icon: createElement("span", { "aria-hidden": true, children: "G" }),
                id: "settings:general",
                label: "General",
              },
            ],
            title: "Application",
          },
        ],
        onBack: () => undefined,
        onNavItemSelect: () => undefined,
      }),
    );

    expect(markup).toContain('id="app-navigation-sidebar"');
    expect(markup).toContain('aria-label="Settings navigation"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('title="General"');
    expect(markup).toContain('title="Back to workspace"');
    expect(markup).toContain("size-9 justify-center");
  });
});
