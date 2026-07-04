import { strict as assert } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { makeDesktopAgentSessionStore } from "../src/main/agents/services/DesktopAgentSessionStore.ts";
import { describe, it } from "vitest";

describe("DesktopAgentSessionStore", () => {
  it("schema-decodes persisted session JSON when rehydrating bindings", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cycle-agent-session-store-"));
    const databasePath = join(directory, "cycle.db");

    try {
      const now = "2026-06-20T00:00:00.000Z";
      const store = makeDesktopAgentSessionStore(databasePath);

      await store.upsert({
        createdAt: now,
        metadata: {
          attempts: 1,
          workspace: "cycle",
        },
        native: {
          sessionId: "native-session-1",
          threadId: "native-thread-1",
        },
        provider: "codex",
        sessionId: "session-1",
        status: "idle",
        updatedAt: now,
      });

      const binding = await store.get("session-1");
      assert.deepEqual(binding?.metadata, { attempts: 1, workspace: "cycle" });
      assert.deepEqual(binding?.native, {
        sessionId: "native-session-1",
        threadId: "native-thread-1",
      });
      await store.close?.();

      const db = new DatabaseSync(databasePath);
      try {
        db.exec("UPDATE agent_session_bindings SET metadata_json = '[]', native_json = '42'");
      } finally {
        db.close();
      }

      const reopened = makeDesktopAgentSessionStore(databasePath);
      try {
        const invalid = await reopened.get("session-1");
        assert.equal(invalid?.metadata, undefined);
        assert.equal(invalid?.native, undefined);
      } finally {
        await reopened.close?.();
      }
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
