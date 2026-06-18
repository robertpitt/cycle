import { describe, expect, it } from "vitest";
import {
  filterMarkdownEditorTagSuggestions,
  getMarkdownEditorTagSuggestionInsertLabel,
  getViewportFloatingMenuPlacement,
  type MarkdownEditorTagSuggestion,
} from "../src/molecules/markdown-editor/markdown-editor.tsx";
import {
  isSafeMarkdownUrl,
  roundTripMarkdown,
} from "../src/molecules/markdown-editor/markdown-editor-utils.ts";

describe("Markdown editor utilities", () => {
  it("round-trips the core Cycle Markdown subset", () => {
    const markdown = [
      "## Hello",
      "",
      "Track [#ROB-10001](cycle-issue:ROB-10001) with **bold**, *italic*, ~~removed~~, and `code`.",
      "",
      "- [x] Done",
      "- [ ] Todo",
      "",
      "1. First",
      "2. Second",
      "",
      "> Quote",
      "",
      "```ts",
      'const bodyFormat = "markdown";',
      "```",
      "",
      "Visit https://example.com.",
    ].join("\n");

    expect(roundTripMarkdown(markdown)).toBe(markdown);
  });

  it("upgrades Cycle reference shorthand to canonical Markdown links", () => {
    const markdown = "Coordinate #rob-10001 with @codex in repo:cycle and commit:ABCDEF1.";

    expect(roundTripMarkdown(markdown)).toBe(
      "Coordinate [#ROB-10001](cycle-issue:ROB-10001) with [@codex](cycle-user:codex) in [repo:cycle](cycle-repository:cycle) and [commit:abcdef1](cycle-commit:abcdef1).",
    );
  });

  it("preserves explicit Cycle reference links", () => {
    const markdown = [
      "Ask [Codex](cycle-agent:codex) to check [cycle](cycle-repository:cycle).",
      "",
      "Review [abcdef1](cycle-commit:abcdef1) with [Robert](cycle-user:robert).",
    ].join("\n");

    expect(roundTripMarkdown(markdown)).toBe(markdown);
  });

  it("preserves compatibility Markdown as source text", () => {
    const markdown = [
      "![alt text](image-url)",
      "",
      "| Field | Value |",
      "| --- | --- |",
      "| Status | Todo |",
      "",
      "<!-- hidden -->",
      "",
      "---",
    ].join("\n");

    expect(roundTripMarkdown(markdown)).toBe(markdown);
  });

  it("normalizes carriage returns to line feeds", () => {
    expect(roundTripMarkdown("Line one\r\n\r\nLine two")).toBe("Line one\n\nLine two");
  });

  it("allows only safe Markdown editor links", () => {
    expect(isSafeMarkdownUrl("https://example.com/docs")).toBe(true);
    expect(isSafeMarkdownUrl("/repositories/cycle")).toBe(true);
    expect(isSafeMarkdownUrl("#comment-1")).toBe(true);
    expect(isSafeMarkdownUrl("cycle-issue:ROB-10001")).toBe(true);
    expect(isSafeMarkdownUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeMarkdownUrl("")).toBe(false);
  });

  it("filters unified tag suggestions by id, label, kind, and search text", () => {
    const suggestions: readonly MarkdownEditorTagSuggestion[] = [
      {
        id: "ROB-10001",
        kind: "issue",
        label: "#ROB-10001",
        searchText: "slash menu clipping",
      },
      {
        id: "codex",
        kind: "agent",
        label: "Codex",
      },
      {
        id: "cycle",
        kind: "repository",
        label: "cycle",
      },
    ];

    expect(filterMarkdownEditorTagSuggestions(suggestions, "slash")).toEqual([suggestions[0]]);
    expect(filterMarkdownEditorTagSuggestions(suggestions, "agent")).toEqual([suggestions[1]]);
    expect(filterMarkdownEditorTagSuggestions(suggestions, "cycle")).toEqual([suggestions[2]]);
  });

  it("derives canonical inserted labels for tag suggestions", () => {
    expect(
      getMarkdownEditorTagSuggestionInsertLabel({
        id: "ROB-10001",
        kind: "issue",
        label: "Fix menu",
      }),
    ).toBe("#ROB-10001");
    expect(
      getMarkdownEditorTagSuggestionInsertLabel({
        id: "codex",
        kind: "agent",
        label: "Codex",
      }),
    ).toBe("@Codex");
    expect(
      getMarkdownEditorTagSuggestionInsertLabel({
        id: "cycle",
        insertLabel: "Cycle workspace",
        kind: "repository",
        label: "cycle",
      }),
    ).toBe("Cycle workspace");
  });

  it("places floating menus above the anchor when the bottom viewport edge would hide them", () => {
    const placement = getViewportFloatingMenuPlacement({
      anchorRect: { bottom: 740, left: 40, right: 60, top: 720 },
      floatingRect: { height: 240, width: 360 },
      viewportRect: { height: 760, width: 800 },
    });

    expect(placement.side).toBe("top");
    expect(placement.style.position).toBe("fixed");
    expect(placement.style.top).toBe(472);
    expect(placement.style.left).toBe(40);
  });

  it("constrains floating menus to the larger side when neither side fully fits", () => {
    const placement = getViewportFloatingMenuPlacement({
      anchorRect: { bottom: 370, left: 40, right: 60, top: 350 },
      floatingRect: { height: 500, width: 360 },
      viewportRect: { height: 600, width: 800 },
    });

    expect(placement.side).toBe("top");
    expect(placement.style.top).toBe(8);
    expect(placement.style.maxHeight).toBe(334);
    expect(placement.style.overflowY).toBe("auto");
  });
});
