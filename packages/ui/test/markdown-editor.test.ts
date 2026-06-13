import { describe, expect, it } from "vitest";
import { roundTripMarkdown } from "../src/molecules/markdown-editor/markdown-editor-utils.ts";

describe("Markdown editor utilities", () => {
  it("round-trips the core Cycle Markdown subset", () => {
    const markdown = [
      "## Hello",
      "",
      "Track #ROB-10001 with **bold**, *italic*, ~~removed~~, and `code`.",
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
});
