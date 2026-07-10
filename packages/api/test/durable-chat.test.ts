import { strict as assert } from "node:assert";
import {
  AgentChatCreateInput,
  AgentChatEvent,
  AgentChatMessage,
  AgentChatSendInput,
  AgentChatThread,
  AgentChatView,
  type AgentChatShape,
} from "@cycle/agent-chat";
import { defaultAgentCapabilities, type AgentProviderProfile } from "@cycle/agents";
import { Effect, Option, Stream } from "effect";
import { describe, it } from "vitest";
import { startCycleApiServer } from "../src/server.ts";
import { projectEventForChatProtocol } from "../src/http/handlers/v1/chat/ws.ts";

type SocketMessage = {
  readonly commandId?: string;
  readonly payload?: unknown;
  readonly type: string;
};

const token = "durable-chat-test-token";
const timestamp = "2026-07-09T12:00:00.000Z";

const makeChat = (
  onCreate?: (input: AgentChatCreateInput) => void,
  onSend?: (input: AgentChatSendInput) => void,
  implementation = false,
): AgentChatShape => {
  let view: AgentChatView | undefined;
  const unsupported = Effect.die(new Error("Unexpected durable chat test operation."));
  return {
    archive: () => unsupported,
    create: (input) =>
      Effect.sync(() => {
        onCreate?.(input);
        view = new AgentChatView({
          interactions: [],
          lastSequence: 1,
          messages: [],
          thread: new AgentChatThread({
            agentId: input.agentId ?? "codex",
            createdAt: timestamp,
            harnessId: input.harnessId ?? "codex",
            ...(implementation
              ? {
                  kind: "ticket-implementation",
                  repositoryId: "repository-1",
                  ticketId: "UKN-28CT1",
                }
              : {}),
            providerId: input.providerId ?? "codex",
            status: "open",
            threadId: "agent_thread_websocket_regression",
            title: input.title,
            updatedAt: timestamp,
          }),
        });
        return view;
      }),
    get: (threadId) =>
      Effect.sync(() =>
        view?.thread.threadId === threadId ? Option.some(view) : Option.none<AgentChatView>(),
      ),
    interrupt: () => unsupported,
    list: () => (view === undefined ? Stream.empty : Stream.make(view.thread)),
    observe: () => Stream.never,
    respond: () => unsupported,
    send: (input) =>
      Effect.sync(() => {
        onSend?.(input);
        if (view === undefined || view.thread.threadId !== input.threadId) {
          throw new Error("Thread was not created before its first message.");
        }
        const taskId = "agent_task_websocket_regression";
        view = new AgentChatView({
          ...view,
          lastSequence: 4,
          messages: [
            new AgentChatMessage({
              content: input.message,
              createdAt: timestamp,
              messageId: "agent_message_websocket_regression",
              role: "user",
              status: "completed",
              taskId,
              updatedAt: timestamp,
            }),
          ],
          thread: new AgentChatThread({ ...view.thread, activeTaskId: taskId, status: "busy" }),
        });
        return view;
      }),
    steer: () => unsupported,
  };
};

const connect = async (baseUrl: string) => {
  const socket = new WebSocket(`${baseUrl.replace(/^http/u, "ws")}/v1/chat/ws`);
  const messages: SocketMessage[] = [];
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("WebSocket failed to open.")), {
      once: true,
    });
  });
  socket.addEventListener("message", (event) => {
    messages.push(JSON.parse(String(event.data)) as SocketMessage);
  });
  let sequence = 0;
  const send = (type: string, payload: unknown) => {
    sequence += 1;
    const commandId = `chat_${sequence}`;
    socket.send(JSON.stringify({ commandId, payload, type, version: 1 }));
    return commandId;
  };
  const waitFor = async (predicate: (message: SocketMessage) => boolean) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const message = messages.find(predicate);
      if (message !== undefined) return message;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("Timed out waiting for WebSocket message.");
  };
  return { send, socket, waitFor };
};

describe("durable chat WebSocket", () => {
  it("projects canonical durable messages into the renderer protocol", async () => {
    const chat = makeChat();
    const view = await Effect.runPromise(
      chat.create(new AgentChatCreateInput({ providerId: "codex" })).pipe(
        Effect.flatMap((created) =>
          chat.send(
            new AgentChatSendInput({
              message: "hello",
              threadId: created.thread.threadId,
            }),
          ),
        ),
      ),
    );
    const message = view.messages[0];
    assert.ok(message);
    const projected = await Effect.runPromise(
      projectEventForChatProtocol(
        chat,
        new AgentChatEvent({
          createdAt: timestamp,
          eventId: "agent_event_websocket_regression",
          payload: { messageId: message.messageId },
          sequence: 4,
          taskId: message.taskId,
          threadId: view.thread.threadId,
          type: "message.completed",
        }),
      ),
    );
    assert.deepEqual(projected[0]?.payload, {
      message: {
        createdAt: timestamp,
        id: message.messageId,
        role: "user",
        streaming: false,
        text: "hello",
        turnId: message.taskId,
        updatedAt: timestamp,
      },
    });
    assert.equal(projected[0]?.type, "message.created");

    const failed = await Effect.runPromise(
      projectEventForChatProtocol(
        chat,
        new AgentChatEvent({
          createdAt: timestamp,
          eventId: "agent_event_failed_websocket_regression",
          payload: { message: "Provider failed visibly." },
          sequence: 5,
          taskId: message.taskId,
          threadId: view.thread.threadId,
          type: "task.failed",
        }),
      ),
    );
    assert.equal(failed[0]?.type, "turn.failed");
    assert.deepEqual(failed[0]?.payload, {
      turn: {
        id: message.taskId,
        lastError: "Provider failed visibly.",
        status: "failed",
        threadId: view.thread.threadId,
      },
    });
  });

  it("accepts the first message in a newly created canonical chat", async () => {
    let createdModel: string | undefined;
    let sentInput: AgentChatSendInput | undefined;
    const providerProfiles: readonly AgentProviderProfile[] = [
      {
        capabilities: defaultAgentCapabilities("codex"),
        checkedAt: timestamp,
        configuration: {},
        defaultModel: "gpt-5.5",
        displayName: "Codex",
        executableName: "codex",
        models: ["gpt-5.5"],
        provider: "codex",
        status: "available",
      },
    ];
    const handle = await startCycleApiServer({
      agentChat: makeChat(
        (input) => {
          createdModel = input.model;
        },
        (input) => {
          sentInput = input;
        },
      ),
      agentProviderProfiles: async () => providerProfiles,
      staticToken: token,
    });
    const client = await connect(handle.baseUrl);
    try {
      client.send("connection.authenticate", { token });
      await client.waitFor((message) => message.type === "connection.ready");
      const createId = client.send("thread.create", { providerId: "codex" });
      const created = await client.waitFor(
        (message) => message.commandId === createId && message.type === "command.ack",
      );
      const createPayload = created.payload as {
        readonly result: { readonly thread: { readonly id: string } };
      };
      const threadId = createPayload.result.thread.id;
      assert.equal(createdModel, "gpt-5.5");
      const sendId = client.send("turn.send", {
        message: "First durable message",
        providerId: "codex",
        threadId,
      });
      const sent = await client.waitFor(
        (message) => message.commandId === sendId && message.type === "command.ack",
      );
      const sendPayload = sent.payload as {
        readonly result: { readonly turn: { readonly id: string } };
      };
      assert.equal(sendPayload.result.turn.id, "agent_task_websocket_regression");
      assert.equal(sentInput?.idempotencyKey, "ws-turn:agent_thread_websocket_regression:chat_3");
    } finally {
      client.socket.close();
      await handle.close();
    }
  });

  it("keeps websocket follow-up delivery idempotent across frontend reconnects", async () => {
    const sent: AgentChatSendInput[] = [];
    const chat = makeChat(undefined, (input) => sent.push(input));
    const view = await Effect.runPromise(
      chat.create(new AgentChatCreateInput({ providerId: "codex" })),
    );
    const handle = await startCycleApiServer({
      agentChat: chat,
      agentProviderProfiles: async () => [],
      staticToken: token,
    });
    const deliver = async () => {
      const client = await connect(handle.baseUrl);
      client.send("connection.authenticate", { token });
      await client.waitFor((message) => message.type === "connection.ready");
      const commandId = client.send("turn.send", {
        message: "Reconnect-safe review feedback",
        providerId: "codex",
        threadId: view.thread.threadId,
      });
      await client.waitFor(
        (message) => message.commandId === commandId && message.type === "command.ack",
      );
      client.socket.close();
    };

    try {
      await deliver();
      await deliver();
      assert.equal(sent.length, 2);
      assert.equal(sent[0]?.idempotencyKey, `ws-turn:${view.thread.threadId}:chat_2`);
      assert.equal(sent[1]?.idempotencyKey, sent[0]?.idempotencyKey);
    } finally {
      await handle.close();
    }
  });

  it("resolves ticket Open chat to the existing implementation thread", async () => {
    let createCount = 0;
    const chat = makeChat(
      () => {
        createCount += 1;
      },
      undefined,
      true,
    );
    const existing = await Effect.runPromise(
      chat.create(new AgentChatCreateInput({ providerId: "codex" })),
    );
    const handle = await startCycleApiServer({
      agentChat: chat,
      agentProviderProfiles: async () => [],
      staticToken: token,
    });
    const client = await connect(handle.baseUrl);
    try {
      client.send("connection.authenticate", { token });
      await client.waitFor((message) => message.type === "connection.ready");
      const commandId = client.send("thread.create", {
        origin: {
          kind: "ticket-agent-work",
          repositoryId: "repository-1",
          ticketId: "UKN-28CT1",
        },
        providerId: "codex",
      });
      const response = await client.waitFor(
        (message) => message.commandId === commandId && message.type === "command.ack",
      );
      const payload = response.payload as {
        readonly result: { readonly thread: { readonly id: string } };
      };
      assert.equal(payload.result.thread.id, existing.thread.threadId);
      assert.equal(createCount, 1);
    } finally {
      client.socket.close();
      await handle.close();
    }
  });
});
