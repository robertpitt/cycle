import { strict as assert } from "node:assert";
import { AgentRuntimeService, type AgentRuntimeServiceShape } from "@cycle/agents/runtime";
import { AgentThread, AgentThreadSnapshot } from "@cycle/agents/models";
import { DateTime, Effect, Layer, Option, Stream } from "effect";
import { describe, it } from "vitest";
import { AgentChat, AgentChatCreateInput, AgentChatLive } from "../src/AgentChat.ts";

const timestamp = DateTime.makeUnsafe("2026-07-09T12:00:00.000Z");

const thread = new AgentThread({
  agentId: "default",
  authority: { allowedOperations: [], mode: "conversation-read" },
  createdAt: timestamp,
  harnessId: "codex",
  kind: "interactive",
  lastSequence: 1,
  metadata: {},
  providerId: "codex",
  schemaVersion: 1,
  status: "open",
  threadId: "agent_thread_test" as never,
  title: "Test chat",
  updatedAt: timestamp,
});

const snapshot = new AgentThreadSnapshot({
  artifacts: [],
  interactions: [],
  lastSequence: 1,
  messages: [],
  tasks: [],
  thread,
});

const unsupported = Effect.die(new Error("unused test operation"));
const runtime: AgentRuntimeServiceShape = {
  archiveThread: () => unsupported,
  cancel: () => unsupported,
  createThread: () => Effect.succeed(snapshot),
  getTask: () => Effect.succeed(Option.none()),
  getThread: () => Effect.succeed(Option.some(snapshot)),
  interrupt: () => unsupported,
  listTasks: () => Stream.empty,
  listThreads: () => Stream.make(thread),
  observe: () => Stream.empty,
  reconcile: () => Stream.empty,
  respond: () => unsupported,
  retry: () => unsupported,
  send: () => unsupported,
  steer: () => unsupported,
  submit: () => unsupported,
};

const layer = AgentChatLive.pipe(
  Layer.provide(Layer.succeed(AgentRuntimeService, AgentRuntimeService.of(runtime))),
);

describe("AgentChat facade", () => {
  it("projects the durable runtime without owning persistence", async () => {
    const view = await Effect.runPromise(
      Effect.gen(function* () {
        const chat = yield* AgentChat;
        return yield* chat.create(
          new AgentChatCreateInput({ providerId: "codex", title: "Test chat" }),
        );
      }).pipe(Effect.provide(layer)),
    );

    assert.equal(view.thread.threadId, thread.threadId);
    assert.equal(view.thread.status, "open");
    assert.equal(view.lastSequence, 1);
  });
});
