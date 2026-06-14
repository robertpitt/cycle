import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownRenderer } from "../src/molecules/markdown-renderer/index.ts";

describe("MarkdownRenderer", () => {
  it("renders Cycle reference shorthand and explicit links as internal controls", () => {
    const markup = renderToStaticMarkup(
      createElement(MarkdownRenderer, {
        markdown: [
          "Track #rob-10001 with @codex in repo:cycle at commit:ABCDEF1.",
          "Ask [Codex](cycle-agent:codex) to review [Robert](cycle-user:robert).",
        ].join("\n"),
      }),
    );

    expect(markup).toContain("<button");
    expect(markup).toContain("#ROB-10001");
    expect(markup).toContain("@codex");
    expect(markup).toContain("repo:cycle");
    expect(markup).toContain("commit:abcdef1");
    expect(markup).toContain("Codex");
    expect(markup).toContain("Robert");
    expect(markup).not.toContain('href="cycle-');
  });

  it("keeps unsafe links inert", () => {
    const markup = renderToStaticMarkup(
      createElement(MarkdownRenderer, {
        markdown: "[bad](javascript:alert(1)) and [ok](https://example.com)",
      }),
    );

    expect(markup).toContain("<span>bad</span>");
    expect(markup).toContain('href="https://example.com"');
    expect(markup).not.toContain("javascript:");
  });
});
