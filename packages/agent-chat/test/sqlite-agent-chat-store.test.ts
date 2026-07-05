import { strict as assert } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { makeSqliteAgentChatStore } from "../src/store/SqliteAgentChatStore.ts";
import { describe, it } from "vitest";

describe("SqliteAgentChatStore", () => {
  it("schema-decodes persisted chat JSON when rehydrating rows", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cycle-agent-chat-store-"));
    const databasePath = join(directory, "cycle.db");

    try {
      const store = makeSqliteAgentChatStore(databasePath);
      const now = "2026-06-20T00:00:00.000Z";

      await store.upsertThread({
        createdAt: now,
        id: "thread-1",
        origin: {
          commentId: "comment-1",
          issueId: "ROB-10001",
          kind: "issue-comment",
          repositoryId: "cycle",
        },
        runtimeMode: "workspace-write",
        status: "draft",
        summary: "Persisted chat",
        title: "Persisted chat",
        updatedAt: now,
      });
      await store.upsertMessage({
        actor: "user",
        body: "Hello",
        createdAt: now,
        id: "message-1",
        metadata: { source: "test" },
        threadId: "thread-1",
        updatedAt: now,
      });
      await store.upsertTurn?.({
        createdAt: now,
        id: "turn-1",
        inputMessageId: "message-1",
        metadata: { thinkingLevel: "high" },
        providerId: "codex",
        runtimeMode: "workspace-write",
        status: "queued",
        threadId: "thread-1",
        updatedAt: now,
      });
      await store.upsertActivity?.({
        createdAt: now,
        id: "activity-1",
        kind: "tool",
        payload: { tool: "cycle_issue_list" },
        status: "completed",
        threadId: "thread-1",
        title: "Tool call",
        updatedAt: now,
      });
      await store.upsertQuestion?.({
        answer: { scope: "now" },
        answeredAt: now,
        createdAt: now,
        id: "question-1",
        prompt: "Choose scope",
        questions: [
          {
            header: "Scope",
            id: "scope",
            multiSelect: false,
            options: [
              {
                description: null,
                disabled: false,
                label: "Now",
                value: "now",
              },
            ],
            question: "Which scope?",
          },
        ],
        status: "answered",
        threadId: "thread-1",
        turnId: "turn-1",
        updatedAt: now,
      });
      await store.appendEvent?.({
        createdAt: now,
        eventId: "event-1",
        payload: { messageId: "message-1" },
        threadId: "thread-1",
        type: "message.created",
      });

      assert.deepEqual((await store.listMessages("thread-1"))[0]?.metadata, { source: "test" });
      assert.equal((await store.getThread?.("thread-1"))?.runtimeMode, "workspace-write");
      assert.deepEqual((await store.getThread?.("thread-1"))?.origin, {
        commentId: "comment-1",
        issueId: "ROB-10001",
        kind: "issue-comment",
        repositoryId: "cycle",
      });
      assert.deepEqual((await store.listTurns?.("thread-1"))?.[0]?.metadata, {
        thinkingLevel: "high",
      });
      assert.equal((await store.listTurns?.("thread-1"))?.[0]?.runtimeMode, "workspace-write");
      assert.deepEqual((await store.listActivities?.("thread-1"))?.[0]?.payload, {
        tool: "cycle_issue_list",
      });
      assert.equal((await store.listQuestions?.("thread-1"))?.[0]?.questions[0]?.id, "scope");
      assert.deepEqual((await store.listEventsAfter?.("thread-1", 0))?.[0]?.payload, {
        messageId: "message-1",
      });
      await store.close?.();

      const db = new DatabaseSync(databasePath);
      try {
        db.exec("UPDATE agent_chat_messages SET metadata_json = '[]'");
        db.exec("UPDATE agent_chat_turns SET metadata_json = 'null'");
        db.exec("UPDATE agent_chat_activities SET payload_json = '42'");
        db.exec('UPDATE agent_chat_questions SET questions_json = \'[{"id":"missing-fields"}]\'');
        db.exec("UPDATE agent_chat_questions SET answer_json = '[]'");
        db.exec("UPDATE agent_chat_events SET payload_json = '[]'");
      } finally {
        db.close();
      }

      const reopened = makeSqliteAgentChatStore(databasePath);
      try {
        assert.equal((await reopened.listMessages("thread-1"))[0]?.metadata, undefined);
        assert.equal((await reopened.listTurns?.("thread-1"))?.[0]?.metadata, undefined);
        assert.equal((await reopened.listActivities?.("thread-1"))?.[0]?.payload, undefined);
        assert.deepEqual((await reopened.listQuestions?.("thread-1"))?.[0]?.questions, []);
        assert.equal((await reopened.listQuestions?.("thread-1"))?.[0]?.answer, undefined);
        assert.deepEqual((await reopened.listEventsAfter?.("thread-1", 0))?.[0]?.payload, {});
      } finally {
        await reopened.close?.();
      }
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
