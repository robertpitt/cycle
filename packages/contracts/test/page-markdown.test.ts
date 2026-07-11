import { Effect, Result, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { parsePageMarkdown, serializePageMarkdown } from "../src/PageMarkdown.ts";
import { PageFrontmatter } from "../src/schemas/entities/PageFrontmatter.ts";

const pageId = "0198f6d4-90a2-7a2a-9f0f-04d232812d31";
const actor = { name: "Robert", type: "human" as const };

const frontmatter = Schema.decodeUnknownSync(PageFrontmatter)({
  alpha: { enabled: true, nested: { b: 2, a: 1 } },
  createdAt: "2026-07-11T10:00:00.000Z",
  createdBy: actor,
  id: pageId,
  schemaVersion: 1,
  title: "Payments",
  updatedAt: "2026-07-11T10:00:00.000Z",
  updatedBy: actor,
  zeta: "last",
});

const serialize = (body: string) =>
  Effect.runSync(
    serializePageMarkdown({
      body,
      bodyFormat: "markdown",
      frontmatter,
    }),
  );

const parseResult = (source: string) => Effect.runSync(Effect.result(parsePageMarkdown(source)));

describe("Page Markdown frontmatter", () => {
  it("serializes deterministically and preserves body text except line endings", () => {
    const serialized = serialize("# Payments\r\n\rDetails\r\n");
    expect(serialized).toBe(serialize("# Payments\r\n\rDetails\r\n"));
    expect(serialized).toMatch(/^---\nid:/u);
    expect(serialized).toContain("\n---\n\n# Payments\n\nDetails\n");
    expect(serialized.indexOf("alpha:")).toBeLessThan(serialized.indexOf("zeta:"));

    const parsed = parseResult(serialized);
    expect(Result.isSuccess(parsed)).toBe(true);
    if (Result.isSuccess(parsed)) {
      expect(parsed.success.body).toBe("# Payments\n\nDetails\n");
      expect(parsed.success.frontmatter.title).toBe("Payments");
      expect(parsed.success.frontmatter.alpha).toEqual({ enabled: true, nested: { a: 1, b: 2 } });
      expect(parsed.success.frontmatter.zeta).toBe("last");
    }
  });

  it("keeps title independent from body headings", () => {
    const parsed = parseResult(serialize("# A different heading"));
    expect(Result.isSuccess(parsed)).toBe(true);
    if (Result.isSuccess(parsed)) {
      expect(parsed.success.frontmatter.title).toBe("Payments");
      expect(parsed.success.body).toBe("# A different heading");
    }
  });

  it("normalizes CRLF input before parsing", () => {
    const crlf = serialize("Body").replaceAll("\n", "\r\n");
    const parsed = parseResult(crlf);
    expect(Result.isSuccess(parsed)).toBe(true);
    if (Result.isSuccess(parsed)) expect(parsed.success.body).toBe("Body");
  });

  it("rejects duplicate fields, aliases, custom tags, unsafe keys, and invalid versions", () => {
    const canonical = serialize("Body");
    const duplicate = canonical.replace(`id: ${pageId}\n`, `id: ${pageId}\nid: ${pageId}\n`);
    const alias = canonical
      .replace("createdBy:\n", "createdBy: &actor\n")
      .replace(/updatedBy:\n  name: Robert\n  type: human/u, "updatedBy: *actor");
    const customTag = canonical.replace("title: Payments", "title: !execute Payments");
    const unsafe = canonical.replace("zeta: last", "constructor: pollute\nzeta: last");
    const invalidVersion = canonical.replace("schemaVersion: 1", "schemaVersion: 2");
    const invalidId = canonical.replace(pageId, "not-a-uuid");

    for (const [label, source] of [
      ["duplicate", duplicate],
      ["alias", alias],
      ["custom tag", customTag],
      ["unsafe key", unsafe],
      ["invalid version", invalidVersion],
      ["invalid id", invalidId],
    ] as const) {
      expect(Result.isFailure(parseResult(source)), label).toBe(true);
    }
  });

  it("rejects missing or unterminated frontmatter", () => {
    expect(Result.isFailure(parseResult("# No frontmatter"))).toBe(true);
    expect(Result.isFailure(parseResult("---\nid: value\n"))).toBe(true);
  });
});
