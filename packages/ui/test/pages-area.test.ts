import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PagesArea,
  buildPagesTree,
  findPagesTreeDirectory,
  isPageDraftDirty,
  pageFileNameFromTitle,
  pagePathFromTitle,
  type PagesAreaPage,
} from "../src/organisms/pages-area/index.ts";

const page = (id: string, path: string, title: string, archived = false): PagesAreaPage => ({
  ...(archived ? { archived: true } : {}),
  body: `# ${title}`,
  id,
  path,
  revisionId: `revision-${id}`,
  title,
});

describe("PagesArea", () => {
  it("derives directories, deterministic ordering, and index cover pages", () => {
    const tree = buildPagesTree([
      page("refunds", "payments/refunds.md", "Refunds"),
      page("cover", "payments/index.md", "Payments"),
      page("stripe", "payments/providers/stripe.md", "Stripe"),
      page("flat", "payments.md", "Payments file"),
      page("alpha", "alpha/readme.md", "Alpha"),
    ]);

    expect(tree.directories.map((directory) => directory.path)).toEqual(["alpha", "payments"]);
    expect(tree.pages.map((entry) => entry.page.id)).toEqual(["flat"]);

    const payments = findPagesTreeDirectory(tree, "payments");
    expect(payments?.cover?.id).toBe("cover");
    expect(payments?.pages.map((entry) => entry.page.id)).toEqual(["refunds"]);
    expect(payments?.directories[0]?.path).toBe("payments/providers");
    expect(payments?.directories[0]?.pages[0]?.page.id).toBe("stripe");
  });

  it("keeps descendants visible when an archived cover is hidden", () => {
    const pages = [
      page("cover", "payments/index.md", "Payments", true),
      page("refunds", "payments/refunds.md", "Refunds"),
    ];

    const activeTree = buildPagesTree(pages);
    const archivedTree = buildPagesTree(pages, true);

    expect(findPagesTreeDirectory(activeTree, "payments")?.cover).toBeUndefined();
    expect(findPagesTreeDirectory(activeTree, "payments")?.pages[0]?.page.id).toBe("refunds");
    expect(findPagesTreeDirectory(archivedTree, "payments")?.cover?.id).toBe("cover");
  });

  it("compares the complete editable draft without normalizing Markdown", () => {
    const current = page("page", "notes/index.md", "Notes");
    const exact = {
      body: current.body,
      path: current.path,
      title: current.title,
    };

    expect(isPageDraftDirty(exact, current)).toBe(false);
    expect(isPageDraftDirty({ ...exact, body: `${exact.body}\r\n` }, current)).toBe(true);
    expect(isPageDraftDirty({ ...exact, path: "Notes/index.md" }, current)).toBe(true);
  });

  it("derives stable Markdown filenames without exposing path construction to the form", () => {
    expect(pageFileNameFromTitle("  Provider recovery & escalation  ")).toBe(
      "provider-recovery-escalation.md",
    );
    expect(pagePathFromTitle("payments/providers", "Stripe EU")).toBe(
      "payments/providers/stripe-eu.md",
    );
    expect(pagePathFromTitle("", "")).toBe("untitled.md");
  });

  it("renders the rich Page editor with an explicit dirty state", () => {
    const current = page("page", "notes/index.md", "Notes");
    const source = "Line one\r\n\r\n  Indented source stays exact.";
    const markup = renderToStaticMarkup(
      createElement(PagesArea, {
        defaultEditing: true,
        defaultSelectedPageId: current.id,
        draft: {
          body: source,
          path: current.path,
          title: current.title,
        },
        onSave: () => undefined,
        pages: [current],
      }),
    );

    expect(markup).toContain("Unsaved");
    expect(markup).toContain('aria-label="Page content"');
    expect(markup).toContain('contentEditable="true"');
    expect(markup).toContain('aria-label="Page title"');
    expect(markup).toContain("Change location");
    expect(markup).not.toContain("<textarea");
    expect(markup).toContain(">Save</button>");
  });

  it("renders Page creation in the document canvas with a generated location", () => {
    const draft = {
      body: "",
      path: "payments/provider-recovery.md",
      title: "Provider recovery",
    };
    const markup = renderToStaticMarkup(
      createElement(PagesArea, {
        creation: {
          directoryPath: "payments",
          draft,
          onCancel: () => undefined,
          onDraftChange: () => undefined,
          onSave: () => undefined,
        },
        pages: [],
      }),
    );

    expect(markup).toContain('aria-label="Page title"');
    expect(markup).toContain('value="Provider recovery"');
    expect(markup).toContain('aria-label="Page content"');
    expect(markup).toContain(">Create page</button>");
    expect(markup).not.toContain("Markdown source");
    expect(markup).not.toContain('value="payments/provider-recovery.md"');
  });

  it("opens a controlled composition at a derived directory", () => {
    const markup = renderToStaticMarkup(
      createElement(PagesArea, {
        defaultViewedDirectoryPath: "payments/providers",
        pages: [page("stripe", "payments/providers/stripe.md", "Stripe")],
      }),
    );

    expect(markup).toContain(">providers</h2>");
    expect(markup).toContain(">Stripe</span>");
  });
});
