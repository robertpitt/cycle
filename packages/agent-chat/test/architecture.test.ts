import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "vitest";

describe("AgentChat architecture", () => {
  it("is a stateless Effect projection with no SQLite or runtime runners", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../src/AgentChat.ts"), "utf8");
    assert.doesNotMatch(source, /@cycle\/sqlite|better-sqlite3|SqlClient/u);
    assert.doesNotMatch(source, /Effect\.run(?:Promise|Sync|Fork)/u);
    assert.doesNotMatch(source, /Promise</u);
    assert.match(source, /AgentRuntimeService/u);
    const packageJson = readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8");
    assert.doesNotMatch(packageJson, /@cycle\/sqlite|legacy-store|legacy-errors/u);
    assert.equal(existsSync(resolve(import.meta.dirname, "../src/SqliteAgentChatStore.ts")), false);
    assert.equal(
      existsSync(resolve(import.meta.dirname, "../src/runtime/AgentChatRuntime.ts")),
      false,
    );
  });
});
