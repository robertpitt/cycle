import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { describe, it } from "vitest";

describe("ticket implementation chat navigation", () => {
  it("opens the durable thread projected by the ticket task", async () => {
    const source = await readFile(
      new URL("../src/renderer/components/ViewIssuePanel.tsx", import.meta.url),
      "utf8",
    );

    assert.match(source, /const threadId = metadataString\(currentTask, "threadId"\)/u);
    assert.match(source, /onOpenChat\(threadId\)/u);
    assert.match(source, /onChatOpen\?\.\(threadId\)/u);
  });
});
