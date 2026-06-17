import {
  isAgentProviderId,
  type AgentArtifact,
  type AgentError,
  type AgentEvent,
  type AgentProviderId,
  type AgentProviderProfile,
  type AgentTurnRequest,
} from "@cycle/agents";
import { Effect, Layer } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";
import { randomUUID } from "node:crypto";
import type {
  AgentChatActivityRecord,
  AgentChatEventRecord,
  AgentChatMessageRecord,
  AgentChatQuestionRecord,
  AgentChatStoreShape,
  AgentChatThreadRecord,
  AgentChatTurnRecord,
  CycleApiRuntimeShape,
} from "../../../runtime/CycleApiRuntime.ts";
import type { ChatMessagePayload, ChatTurnPayload } from "./domain.ts";
import { isRecord } from "./domain.ts";
import { prepareChatTurn, requestOrigin } from "./prepare.ts";

type WriteMessage = (message: ServerMessage) => Promise<void>;

type ClientMessage = {
  readonly commandId?: string;
  readonly payload?: unknown;
  readonly type?: string;
  readonly version?: number;
};

type ServerMessage = {
  readonly commandId?: string;
  readonly createdAt?: string;
  readonly eventId?: string;
  readonly payload?: unknown;
  readonly sequence?: number;
  readonly threadId?: string;
  readonly type: string;
  readonly version: 1;
};

type ChatConnection = {
  readonly id: string;
  readonly authorizationToken?: string;
  authenticated: boolean;
  readonly close: () => void;
  readonly origin: string;
  readonly send: WriteMessage;
  readonly subscribedThreadIds: Set<string>;
};

type ChatGateway = {
  readonly connect: (
    write: WriteMessage,
    origin: string,
    authorizationToken: string | undefined,
  ) => ChatConnection;
  readonly handleRawMessage: (connection: ChatConnection, raw: string) => Promise<void>;
};

export const makeChatWebSocketLayer = (
  runtime: CycleApiRuntimeShape,
): Layer.Layer<never, never, never> => {
  const gateway = makeChatGateway(runtime);

  return HttpRouter.add("GET", "/v1/chat/ws", (request) =>
    Effect.scoped(
      Effect.gen(function* () {
        const origin = requestOrigin({
          headers: request.headers,
          url: request.url,
        });
        const authorizationToken = bearerTokenFromHeaders(request.headers);
        const socket = yield* request.upgrade;
        const write = yield* socket.writer;
        let connection: ChatConnection | undefined;

        const send: WriteMessage = async (message) => {
          await Effect.runPromise(write(JSON.stringify(message)));
        };

        const readLoop = socket
          .runString((raw) =>
            Effect.promise(async () => {
              connection ??= gateway.connect(send, origin, authorizationToken);
              await gateway.handleRawMessage(connection, raw);
            }),
          )
          .pipe(
            Effect.ensuring(
              Effect.sync(() => {
                connection?.close();
              }),
            ),
            Effect.catch(() => Effect.void),
          );
        yield* readLoop;

        return HttpServerResponse.empty();
      }).pipe(
        Effect.catch(() =>
          Effect.succeed(
            HttpServerResponse.text("WebSocket upgrade required.", {
              status: 400,
            }),
          ),
        ),
      ),
    ),
  ) as Layer.Layer<never, never, never>;
};

const makeChatGateway = (runtime: CycleApiRuntimeShape): ChatGateway => {
  const connections = new Map<string, ChatConnection>();
  const subscribersByThreadId = new Map<string, Set<ChatConnection>>();
  const activeTurnsByThreadId = new Map<string, AbortController>();

  const store = () => runtime.agentChatStore;

  const publish = async (
    threadId: string,
    type: string,
    payload: Readonly<Record<string, unknown>>,
    createdAt = runtime.now().toISOString(),
  ): Promise<AgentChatEventRecord | undefined> => {
    const event = await appendEvent(store(), {
      createdAt,
      eventId: chatId("event"),
      payload,
      threadId,
      type,
    });
    const message: ServerMessage = {
      createdAt,
      eventId: event?.eventId,
      payload,
      sequence: event?.sequence,
      threadId,
      type,
      version: 1,
    };
    const subscribers = subscribersByThreadId.get(threadId);
    if (subscribers === undefined) return event;

    await Promise.all([...subscribers].map((connection) => safeSend(connection, message)));
    return event;
  };

  const sendCommandError = (
    connection: ChatConnection,
    command: ClientMessage,
    code: string,
    message: string,
    retryable = false,
  ) =>
    safeSend(connection, {
      commandId: command.commandId,
      payload: {
        code,
        message,
        retryable,
        type: command.type,
      },
      type: "command.error",
      version: 1,
    });

  const acknowledge = (connection: ChatConnection, command: ClientMessage, result?: unknown) =>
    safeSend(connection, {
      commandId: command.commandId,
      payload: {
        result,
        type: command.type,
      },
      type: "command.ack",
      version: 1,
    });

  const requireAuthenticated = async (
    connection: ChatConnection,
    command: ClientMessage,
  ): Promise<boolean> => {
    if (connection.authenticated) return true;
    await sendCommandError(
      connection,
      command,
      "UNAUTHENTICATED",
      "Authenticate the chat socket before issuing commands.",
    );
    return false;
  };

  const requireStore = async (
    connection: ChatConnection,
    command: ClientMessage,
  ): Promise<AgentChatStoreShape | undefined> => {
    const chatStore = store();
    if (chatStore !== undefined) return chatStore;
    await sendCommandError(
      connection,
      command,
      "CHAT_STORE_UNAVAILABLE",
      "The local chat store is unavailable.",
      true,
    );
    return undefined;
  };

  const subscribe = (connection: ChatConnection, threadId: string) => {
    connection.subscribedThreadIds.add(threadId);
    let subscribers = subscribersByThreadId.get(threadId);
    if (subscribers === undefined) {
      subscribers = new Set();
      subscribersByThreadId.set(threadId, subscribers);
    }
    subscribers.add(connection);
  };

  const unsubscribe = (connection: ChatConnection, threadId: string) => {
    connection.subscribedThreadIds.delete(threadId);
    const subscribers = subscribersByThreadId.get(threadId);
    subscribers?.delete(connection);
    if (subscribers?.size === 0) subscribersByThreadId.delete(threadId);
  };

  const close = (connection: ChatConnection) => {
    connections.delete(connection.id);
    for (const threadId of connection.subscribedThreadIds) {
      subscribersByThreadId.get(threadId)?.delete(connection);
      if (subscribersByThreadId.get(threadId)?.size === 0) {
        subscribersByThreadId.delete(threadId);
      }
    }
    connection.subscribedThreadIds.clear();
  };

  const handleCommand = async (
    connection: ChatConnection,
    command: ClientMessage,
    origin: string,
  ) => {
    switch (command.type) {
      case "connection.authenticate": {
        const payload = objectPayload(command);
        const token = typeof payload.token === "string" ? payload.token : undefined;
        if (token !== runtime.staticToken && connection.authorizationToken !== runtime.staticToken) {
          await safeSend(connection, {
            commandId: command.commandId,
            payload: {
              code: "UNAUTHENTICATED",
              message: "Invalid chat socket token.",
              retryable: false,
            },
            type: "command.error",
            version: 1,
          });
          connection.close();
          return;
        }
        connection.authenticated = true;
        await safeSend(connection, {
          payload: {
            connectionId: connection.id,
            protocolVersion: 1,
            serverTime: runtime.now().toISOString(),
          },
          type: "connection.ready",
          version: 1,
        });
        return;
      }

      case "provider.list": {
        if (!(await requireAuthenticated(connection, command))) return;
        const profiles = await runtime.agentProviderProfiles();
        await safeSend(connection, {
          commandId: command.commandId,
          payload: {
            providers: profiles.map(providerProfileForChat),
          },
          type: "provider.list.snapshot",
          version: 1,
        });
        await acknowledge(connection, command);
        return;
      }

      case "thread.list": {
        if (!(await requireAuthenticated(connection, command))) return;
        const chatStore = await requireStore(connection, command);
        if (chatStore === undefined) return;
        const payload = objectPayload(command);
        const includeArchived = payload.includeArchived === true;
        const threads = (await chatStore.listThreads())
          .map(threadForProtocol)
          .filter((thread) => includeArchived || thread.status !== "archived");
        await safeSend(connection, {
          commandId: command.commandId,
          payload: {
            threads,
          },
          type: "thread.list.snapshot",
          version: 1,
        });
        await acknowledge(connection, command);
        return;
      }

      case "thread.create": {
        if (!(await requireAuthenticated(connection, command))) return;
        const chatStore = await requireStore(connection, command);
        if (chatStore === undefined) return;
        const payload = objectPayload(command);
        const now = runtime.now().toISOString();
        const providerId = providerFromUnknown(payload.providerId);
        const thread: AgentChatThreadRecord = {
          ...(providerId === undefined ? {} : { agentId: providerId }),
          createdAt: now,
          id: chatId("thread"),
          model: stringOrNull(payload.model),
          status: "draft",
          summary: "New conversation",
          thinkingLevel: stringOrNull(payload.thinkingLevel),
          title: stringValue(payload.title) ?? "New chat",
          updatedAt: now,
        };
        await chatStore.upsertThread(thread);
        await acknowledge(connection, command, { thread: threadForProtocol(thread) });
        await publish(thread.id, "thread.updated", { thread: threadForProtocol(thread) }, now);
        return;
      }

      case "thread.subscribe": {
        if (!(await requireAuthenticated(connection, command))) return;
        const chatStore = await requireStore(connection, command);
        if (chatStore === undefined) return;
        const payload = objectPayload(command);
        const threadId = stringValue(payload.threadId);
        if (threadId === undefined) {
          await sendCommandError(connection, command, "INVALID_PAYLOAD", "threadId is required.");
          return;
        }
        const snapshot = await threadSnapshot(chatStore, threadId);
        if (snapshot === undefined) {
          await sendCommandError(connection, command, "THREAD_NOT_FOUND", "Thread not found.");
          return;
        }
        subscribe(connection, threadId);
        await safeSend(connection, {
          commandId: command.commandId,
          payload: snapshot,
          threadId,
          type: "thread.snapshot",
          version: 1,
        });
        await acknowledge(connection, command);
        return;
      }

      case "thread.unsubscribe": {
        if (!(await requireAuthenticated(connection, command))) return;
        const threadId = stringValue(objectPayload(command).threadId);
        if (threadId !== undefined) unsubscribe(connection, threadId);
        await acknowledge(connection, command);
        return;
      }

      case "thread.update_settings": {
        if (!(await requireAuthenticated(connection, command))) return;
        const chatStore = await requireStore(connection, command);
        if (chatStore === undefined) return;
        const payload = objectPayload(command);
        const threadId = stringValue(payload.threadId);
        if (threadId === undefined) {
          await sendCommandError(connection, command, "INVALID_PAYLOAD", "threadId is required.");
          return;
        }
        const thread = await getThread(chatStore, threadId);
        if (thread === undefined) {
          await sendCommandError(connection, command, "THREAD_NOT_FOUND", "Thread not found.");
          return;
        }
        const nextThread: AgentChatThreadRecord = {
          ...thread,
          ...(providerFromUnknown(payload.providerId) === undefined
            ? {}
            : { agentId: providerFromUnknown(payload.providerId) }),
          ...(typeof payload.model === "string" || payload.model === null
            ? { model: stringOrNull(payload.model) }
            : {}),
          ...(typeof payload.thinkingLevel === "string" || payload.thinkingLevel === null
            ? { thinkingLevel: stringOrNull(payload.thinkingLevel) }
            : {}),
          updatedAt: runtime.now().toISOString(),
        };
        await chatStore.upsertThread(nextThread);
        await acknowledge(connection, command, { thread: threadForProtocol(nextThread) });
        await publish(nextThread.id, "thread.updated", {
          thread: threadForProtocol(nextThread),
        });
        return;
      }

      case "turn.send": {
        if (!(await requireAuthenticated(connection, command))) return;
        const chatStore = await requireStore(connection, command);
        if (chatStore === undefined) return;
        await sendTurn({
          chatStore,
          command,
          connection,
          origin,
          publish,
          runtime,
          activeTurnsByThreadId,
        });
        return;
      }

      case "turn.cancel": {
        if (!(await requireAuthenticated(connection, command))) return;
        const payload = objectPayload(command);
        const threadId = stringValue(payload.threadId);
        if (threadId === undefined) {
          await sendCommandError(connection, command, "INVALID_PAYLOAD", "threadId is required.");
          return;
        }
        const controller = activeTurnsByThreadId.get(threadId);
        controller?.abort(new Error("Chat turn cancellation requested."));
        await acknowledge(connection, command, { accepted: controller !== undefined });
        return;
      }

      case "question.respond": {
        if (!(await requireAuthenticated(connection, command))) return;
        const chatStore = await requireStore(connection, command);
        if (chatStore === undefined) return;
        await respondToQuestion(chatStore, runtime, command, connection, publish);
        return;
      }

      case "ping": {
        await safeSend(connection, {
          commandId: command.commandId,
          payload: {
            serverTime: runtime.now().toISOString(),
          },
          type: "pong",
          version: 1,
        });
        return;
      }

      default:
        await sendCommandError(
          connection,
          command,
          "INVALID_MESSAGE",
          `Unknown chat command: ${command.type ?? "unknown"}.`,
        );
    }
  };

  return {
    connect: (write, origin, authorizationToken) => {
      const connection: ChatConnection = {
        ...(authorizationToken === undefined ? {} : { authorizationToken }),
        authenticated: false,
        close: () => close(connection),
        id: chatId("connection"),
        origin,
        send: write,
        subscribedThreadIds: new Set(),
      };
      connections.set(connection.id, connection);
      return connection;
    },
    handleRawMessage: async (connection, raw) => {
      const command = parseClientMessage(raw);
      if (command === undefined) {
        await safeSend(connection, {
          payload: {
            code: "INVALID_MESSAGE",
            message: "Chat socket received invalid JSON.",
            retryable: false,
          },
          type: "command.error",
          version: 1,
        });
        connection.close();
        return;
      }
      await handleCommand(connection, command, connection.origin);
    },
  };
};

const sendTurn = async (input: {
  readonly activeTurnsByThreadId: Map<string, AbortController>;
  readonly chatStore: AgentChatStoreShape;
  readonly command: ClientMessage;
  readonly connection: ChatConnection;
  readonly origin: string;
  readonly publish: (
    threadId: string,
    type: string,
    payload: Readonly<Record<string, unknown>>,
    createdAt?: string,
  ) => Promise<AgentChatEventRecord | undefined>;
  readonly runtime: CycleApiRuntimeShape;
}): Promise<void> => {
  const payload = objectPayload(input.command);
  const threadId = stringValue(payload.threadId);
  const message = stringValue(payload.message)?.trim();
  const providerId = providerFromUnknown(payload.providerId);

  if (threadId === undefined || message === undefined || providerId === undefined) {
    await safeSend(input.connection, {
      commandId: input.command.commandId,
      payload: {
        code: "INVALID_PAYLOAD",
        message: "threadId, message, and providerId are required.",
        retryable: false,
        type: input.command.type,
      },
      type: "command.error",
      version: 1,
    });
    return;
  }

  const thread = await getThread(input.chatStore, threadId);
  if (thread === undefined) {
    await safeSend(input.connection, {
      commandId: input.command.commandId,
      payload: {
        code: "THREAD_NOT_FOUND",
        message: "Thread not found.",
        retryable: false,
        type: input.command.type,
      },
      type: "command.error",
      version: 1,
    });
    return;
  }
  if (thread.activeTurnId !== undefined && thread.activeTurnId !== null) {
    await safeSend(input.connection, {
      commandId: input.command.commandId,
      payload: {
        code: "THREAD_TURN_ACTIVE",
        message: "A chat turn is already active for this thread.",
        retryable: false,
        type: input.command.type,
      },
      type: "command.error",
      version: 1,
    });
    return;
  }

  const now = input.runtime.now().toISOString();
  const turnId = chatId("turn");
  const userMessage: AgentChatMessageRecord = {
    actor: "user",
    body: message,
    createdAt: now,
    id: chatId("message"),
    threadId,
    turnId,
    updatedAt: now,
  };
  const turn: AgentChatTurnRecord = {
    createdAt: now,
    id: turnId,
    inputMessageId: userMessage.id,
    metadata: isRecord(payload.metadata) ? payload.metadata : undefined,
    model: stringOrNull(payload.model),
    providerId,
    status: "queued",
    thinkingLevel: stringOrNull(payload.thinkingLevel),
    threadId,
    updatedAt: now,
  };
  const nextThread: AgentChatThreadRecord = {
    ...thread,
    activeTurnId: turnId,
    agentId: providerId,
    lastError: null,
    model: turn.model,
    status: "active",
    summary: message.slice(0, 120),
    thinkingLevel: turn.thinkingLevel,
    title: thread.title === "New chat" ? message.slice(0, 72) : thread.title,
    updatedAt: now,
  };

  await input.chatStore.upsertMessage(userMessage);
  await input.chatStore.upsertTurn?.(turn);
  await input.chatStore.upsertThread(nextThread);
  await input.publish(threadId, "message.created", { message: messageForProtocol(userMessage) }, now);
  await input.publish(threadId, "turn.started", { turn: turnForProtocol(turn) }, now);
  await input.publish(threadId, "thread.updated", { thread: threadForProtocol(nextThread) }, now);
  await safeSend(input.connection, {
    commandId: input.command.commandId,
    payload: {
      result: {
        thread: threadForProtocol(nextThread),
        turn: turnForProtocol(turn),
      },
      type: input.command.type,
    },
    type: "command.ack",
    version: 1,
  });

  void runProviderTurn({
    activeTurnsByThreadId: input.activeTurnsByThreadId,
    chatStore: input.chatStore,
    origin: input.origin,
    publish: input.publish,
    runtime: input.runtime,
    thread: nextThread,
    turn,
    userMessage,
  });
};

const runProviderTurn = async (input: {
  readonly activeTurnsByThreadId: Map<string, AbortController>;
  readonly chatStore: AgentChatStoreShape;
  readonly origin: string;
  readonly publish: (
    threadId: string,
    type: string,
    payload: Readonly<Record<string, unknown>>,
    createdAt?: string,
  ) => Promise<AgentChatEventRecord | undefined>;
  readonly runtime: CycleApiRuntimeShape;
  readonly thread: AgentChatThreadRecord;
  readonly turn: AgentChatTurnRecord;
  readonly userMessage: AgentChatMessageRecord;
}): Promise<void> => {
  const service = await Effect.runPromise(input.runtime.agentServices.serviceFor(input.turn.providerId as AgentProviderId));
  const activeTurn = input.runtime.activeAgentTurns.begin({
    provider: input.turn.providerId as AgentProviderId,
    requestId: input.turn.id,
    sessionId: input.thread.sessionId ?? input.thread.id,
    threadId: input.thread.id,
  });
  if (!activeTurn.active) {
    await failTurn(input, "A chat turn is already active for this thread.");
    return;
  }

  input.activeTurnsByThreadId.set(input.thread.id, activeTurn.record.abortController);

  let assistantMessage: AgentChatMessageRecord | undefined;
  let latestAssistantText = "";
  const messages = await input.chatStore.listMessages(input.thread.id);
  const prepared = prepareChatTurn({
    origin: input.origin,
    payload: {
      message: input.userMessage.body,
      messages: messages.map(messagePayloadFromRecord),
      model: input.turn.model ?? undefined,
      provider: input.turn.providerId as AgentProviderId,
      sessionId: input.thread.sessionId ?? input.thread.id,
      threadId: input.thread.id,
    } satisfies ChatTurnPayload,
    requestId: input.turn.id,
    runtime: input.runtime,
  });
  const agentRequest: AgentTurnRequest = {
    ...prepared.agentRequest,
    metadata: {
      ...prepared.agentRequest.metadata,
      ...(input.turn.thinkingLevel === null || input.turn.thinkingLevel === undefined
        ? {}
        : { thinkingLevel: input.turn.thinkingLevel }),
    },
    signal: activeTurn.record.abortController.signal,
  };

  try {
    await updateTurn(input, {
      status: "running",
    });

    for await (const event of service.stream(prepared.sessionId, agentRequest)) {
      switch (event.type) {
        case "turn.started":
          await updateTurn(input, { status: "running" });
          break;

        case "text.delta": {
          const delta = event.delta;
          latestAssistantText = event.snapshot ?? `${latestAssistantText}${delta}`;
          if (assistantMessage === undefined) {
            const createdAt = event.at.toISOString();
            assistantMessage = {
              actor: "agent",
              body: latestAssistantText,
              createdAt,
              id: chatId("message-agent"),
              streaming: true,
              threadId: input.thread.id,
              turnId: input.turn.id,
              updatedAt: createdAt,
            };
            await input.chatStore.upsertMessage(assistantMessage);
            await input.publish(input.thread.id, "message.created", {
              message: messageForProtocol(assistantMessage),
            }, createdAt);
          } else {
            assistantMessage = {
              ...assistantMessage,
              body: latestAssistantText,
              streaming: true,
              updatedAt: event.at.toISOString(),
            };
            await input.chatStore.upsertMessage(assistantMessage);
          }
          await input.publish(input.thread.id, "message.delta", {
            delta,
            messageId: assistantMessage.id,
            snapshot: event.snapshot,
            turnId: input.turn.id,
          }, event.at.toISOString());
          break;
        }

        case "progress":
          await upsertActivity(input, {
            createdAt: event.at.toISOString(),
            detail: event.message,
            id: chatId("activity-progress"),
            kind: "progress",
            payload: isRecord(event.raw) ? event.raw : undefined,
            status: "running",
            threadId: input.thread.id,
            title: event.message,
            turnId: input.turn.id,
            updatedAt: event.at.toISOString(),
          });
          break;

        case "artifact":
          await upsertActivity(input, activityFromArtifact(event.artifact, input, event));
          break;

        case "usage":
          await upsertActivity(input, {
            createdAt: event.at.toISOString(),
            detail: usageDetail(event.usage),
            id: chatId("activity-usage"),
            kind: "usage",
            payload: event.usage as unknown as Readonly<Record<string, unknown>>,
            status: "completed",
            threadId: input.thread.id,
            title: "Usage summary",
            turnId: input.turn.id,
            updatedAt: event.at.toISOString(),
          });
          break;

        case "turn.completed": {
          const completedAt = event.at.toISOString();
          const finalText = event.result.text || latestAssistantText;
          assistantMessage = {
            actor: "agent",
            body: finalText,
            createdAt: assistantMessage?.createdAt ?? completedAt,
            id: assistantMessage?.id ?? chatId("message-agent"),
            streaming: false,
            threadId: input.thread.id,
            turnId: input.turn.id,
            updatedAt: completedAt,
          };
          await input.chatStore.upsertMessage(assistantMessage);
          await input.publish(input.thread.id, "message.completed", {
            message: messageForProtocol(assistantMessage),
          }, completedAt);
          await completeTurn(input, "completed", completedAt, undefined, assistantMessage.id);
          return;
        }

        case "turn.failed":
          await failTurn(input, event.error.message, event.at.toISOString(), event.error);
          return;

        case "turn.cancelled":
          await cancelTurn(input, event.error.message, event.at.toISOString(), event.error);
          return;
      }
    }

    await completeTurn(
      input,
      "completed",
      input.runtime.now().toISOString(),
      undefined,
      assistantMessage?.id,
    );
  } catch (error) {
    const aborted = activeTurn.record.abortController.signal.aborted;
    const message = error instanceof Error ? error.message : String(error);
    if (aborted) {
      await cancelTurn(input, message, input.runtime.now().toISOString());
    } else {
      await failTurn(input, message, input.runtime.now().toISOString());
    }
  } finally {
    input.activeTurnsByThreadId.delete(input.thread.id);
    input.runtime.activeAgentTurns.finish(input.turn.providerId as AgentProviderId, input.thread.sessionId ?? input.thread.id);
  }
};

const updateTurn = async (
  input: Parameters<typeof runProviderTurn>[0],
  patch: Partial<AgentChatTurnRecord>,
) => {
  const updated: AgentChatTurnRecord = {
    ...input.turn,
    ...patch,
    updatedAt: input.runtime.now().toISOString(),
  };
  Object.assign(input.turn as any, updated);
  await input.chatStore.upsertTurn?.(updated);
  await input.publish(input.thread.id, "turn.started", { turn: turnForProtocol(updated) });
};

const completeTurn = async (
  input: Parameters<typeof runProviderTurn>[0],
  status: "completed" | "failed" | "cancelled",
  completedAt: string,
  error?: string,
  assistantMessageId?: string,
) => {
  const turn: AgentChatTurnRecord = {
    ...input.turn,
    ...(assistantMessageId === undefined ? {} : { assistantMessageId }),
    completedAt,
    lastError: error ?? null,
    status,
    updatedAt: completedAt,
  };
  const thread: AgentChatThreadRecord = {
    ...input.thread,
    activeTurnId: null,
    lastError: error ?? null,
    status: status === "failed" ? "error" : "active",
    summary: status === "completed" ? input.thread.summary : error ?? input.thread.summary,
    updatedAt: completedAt,
  };
  await input.chatStore.upsertTurn?.(turn);
  await input.chatStore.upsertThread(thread);
  await input.publish(input.thread.id, `turn.${status}`, { turn: turnForProtocol(turn) }, completedAt);
  await input.publish(input.thread.id, "thread.updated", { thread: threadForProtocol(thread) }, completedAt);
};

const failTurn = (
  input: Parameters<typeof runProviderTurn>[0],
  message: string,
  completedAt = input.runtime.now().toISOString(),
  error?: AgentError,
) =>
  Promise.all([
    upsertActivity(input, {
      createdAt: completedAt,
      detail: message,
      id: chatId("activity-error"),
      kind: "error",
      payload: error === undefined ? undefined : (publicAgentError(error) as Record<string, unknown>),
      status: "failed",
      threadId: input.thread.id,
      title: "Agent turn failed",
      turnId: input.turn.id,
      updatedAt: completedAt,
    }),
    completeTurn(input, "failed", completedAt, message),
  ]).then(() => undefined);

const cancelTurn = (
  input: Parameters<typeof runProviderTurn>[0],
  message: string,
  completedAt = input.runtime.now().toISOString(),
  error?: AgentError,
) =>
  Promise.all([
    upsertActivity(input, {
      createdAt: completedAt,
      detail: message,
      id: chatId("activity-cancelled"),
      kind: "system",
      payload: error === undefined ? undefined : (publicAgentError(error) as Record<string, unknown>),
      status: "cancelled",
      threadId: input.thread.id,
      title: "Agent turn cancelled",
      turnId: input.turn.id,
      updatedAt: completedAt,
    }),
    completeTurn(input, "cancelled", completedAt, message),
  ]).then(() => undefined);

const upsertActivity = async (
  input: Parameters<typeof runProviderTurn>[0],
  activity: AgentChatActivityRecord,
) => {
  await input.chatStore.upsertActivity?.(activity);
  await input.publish(activity.threadId, "activity.upserted", {
    activity: activityForProtocol(activity),
  }, activity.updatedAt ?? activity.createdAt);
};

const respondToQuestion = async (
  chatStore: AgentChatStoreShape,
  runtime: CycleApiRuntimeShape,
  command: ClientMessage,
  connection: ChatConnection,
  publish: (
    threadId: string,
    type: string,
    payload: Readonly<Record<string, unknown>>,
    createdAt?: string,
  ) => Promise<AgentChatEventRecord | undefined>,
): Promise<void> => {
  const payload = objectPayload(command);
  const threadId = stringValue(payload.threadId);
  const questionId = stringValue(payload.questionId);
  if (threadId === undefined || questionId === undefined || !isRecord(payload.answers)) {
    await safeSend(connection, {
      commandId: command.commandId,
      payload: {
        code: "INVALID_PAYLOAD",
        message: "threadId, questionId, and answers are required.",
        retryable: false,
        type: command.type,
      },
      type: "command.error",
      version: 1,
    });
    return;
  }
  const questions = (await chatStore.listQuestions?.(threadId)) ?? [];
  const question = questions.find((candidate) => candidate.id === questionId);
  if (question === undefined || question.status !== "open") {
    await safeSend(connection, {
      commandId: command.commandId,
      payload: {
        code: question === undefined ? "QUESTION_NOT_FOUND" : "QUESTION_NOT_OPEN",
        message: question === undefined ? "Question not found." : "Question is not open.",
        retryable: false,
        type: command.type,
      },
      type: "command.error",
      version: 1,
    });
    return;
  }
  const answeredAt = runtime.now().toISOString();
  const updated: AgentChatQuestionRecord = {
    ...question,
    answer: payload.answers,
    answeredAt,
    status: "answered",
    updatedAt: answeredAt,
  };
  await chatStore.upsertQuestion?.(updated);
  await acknowledgeQuestion(connection, command, updated);
  await publish(threadId, "question.resolved", {
    answer: updated.answer ?? {},
    answeredAt,
    questionId,
    status: "answered",
  }, answeredAt);
};

const acknowledgeQuestion = (
  connection: ChatConnection,
  command: ClientMessage,
  question: AgentChatQuestionRecord,
) =>
  safeSend(connection, {
    commandId: command.commandId,
    payload: {
      result: {
        question: questionForProtocol(question),
      },
      type: command.type,
    },
    type: "command.ack",
    version: 1,
  });

const threadSnapshot = async (store: AgentChatStoreShape, threadId: string) => {
  const thread = await getThread(store, threadId);
  if (thread === undefined) return undefined;
  const messages = await store.listMessages(threadId);
  const activities = (await store.listActivities?.(threadId)) ?? [];
  const questions = (await store.listQuestions?.(threadId)) ?? [];
  const turns = (await store.listTurns?.(threadId)) ?? [];
  const events = (await store.listEventsAfter?.(threadId, 0)) ?? [];

  return {
    activities: activities.map(activityForProtocol),
    lastSequence: events.at(-1)?.sequence ?? 0,
    messages: messages.map(messageForProtocol),
    questions: questions.map(questionForProtocol),
    thread: threadForProtocol(thread),
    turns: turns.map(turnForProtocol),
  };
};

const getThread = async (
  store: AgentChatStoreShape,
  threadId: string,
): Promise<AgentChatThreadRecord | undefined> => {
  const direct = await store.getThread?.(threadId);
  if (direct !== undefined) return direct;
  return (await store.listThreads()).find((thread) => thread.id === threadId);
};

const appendEvent = (
  store: AgentChatStoreShape | undefined,
  event: Omit<AgentChatEventRecord, "sequence">,
): Promise<AgentChatEventRecord | undefined> =>
  store?.appendEvent === undefined ? Promise.resolve(undefined) : store.appendEvent(event);

const safeSend = (connection: ChatConnection, message: ServerMessage): Promise<void> =>
  connection.send(message).catch(() => {
    connection.close();
  });

const parseClientMessage = (raw: string): ClientMessage | undefined => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) && typeof parsed.type === "string"
      ? (parsed as ClientMessage)
      : undefined;
  } catch {
    return undefined;
  }
};

const objectPayload = (command: ClientMessage): Readonly<Record<string, unknown>> =>
  isRecord(command.payload) ? command.payload : {};

const bearerTokenFromHeaders = (
  headers: Readonly<Record<string, string | undefined>>,
): string | undefined => {
  const authorization = headers.authorization;
  if (authorization === undefined) return undefined;
  const match = /^Bearer\s+(.+)$/iu.exec(authorization);
  return match?.[1];
};

const providerFromUnknown = (value: unknown): AgentProviderId | undefined =>
  typeof value === "string" && isAgentProviderId(value) ? value : undefined;

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

const chatId = (prefix: string): string => `${prefix}_${randomUUID()}`;

const threadForProtocol = (thread: AgentChatThreadRecord): Readonly<Record<string, unknown>> => ({
  activeTurnId: thread.activeTurnId ?? null,
  archivedAt: thread.archivedAt ?? null,
  createdAt: thread.createdAt,
  id: thread.id,
  lastError: thread.lastError ?? null,
  model: thread.model ?? null,
  providerId: thread.agentId ?? null,
  sessionId: thread.sessionId ?? null,
  status: thread.status,
  summary: thread.summary,
  thinkingLevel: thread.thinkingLevel ?? null,
  title: thread.title,
  updatedAt: thread.updatedAt,
});

const messageForProtocol = (message: AgentChatMessageRecord): Readonly<Record<string, unknown>> => ({
  createdAt: message.createdAt,
  id: message.id,
  role: message.actor === "agent" ? "assistant" : "user",
  sequence: message.sequence,
  streaming: message.streaming ?? false,
  text: message.body,
  turnId: message.turnId ?? null,
  updatedAt: message.updatedAt ?? message.createdAt,
});

const turnForProtocol = (turn: AgentChatTurnRecord): Readonly<Record<string, unknown>> => ({
  assistantMessageId: turn.assistantMessageId ?? null,
  completedAt: turn.completedAt ?? null,
  createdAt: turn.createdAt,
  id: turn.id,
  inputMessageId: turn.inputMessageId,
  lastError: turn.lastError ?? null,
  model: turn.model ?? null,
  providerId: turn.providerId,
  status: turn.status,
  thinkingLevel: turn.thinkingLevel ?? null,
  threadId: turn.threadId,
  updatedAt: turn.updatedAt,
});

const activityForProtocol = (
  activity: AgentChatActivityRecord,
): Readonly<Record<string, unknown>> => ({
  createdAt: activity.createdAt,
  detail: activity.detail ?? null,
  id: activity.id,
  kind: activity.kind,
  payload: activity.payload ?? null,
  status: activity.status ?? null,
  title: activity.title,
  turnId: activity.turnId ?? null,
  updatedAt: activity.updatedAt ?? activity.createdAt,
});

const questionForProtocol = (
  question: AgentChatQuestionRecord,
): Readonly<Record<string, unknown>> => ({
  answeredAt: question.answeredAt ?? null,
  createdAt: question.createdAt,
  id: question.id,
  prompt: question.prompt,
  questions: question.questions,
  status: question.status,
  turnId: question.turnId,
  updatedAt: question.updatedAt ?? question.createdAt,
});

const messagePayloadFromRecord = (message: AgentChatMessageRecord): ChatMessagePayload => ({
  content: message.body,
  createdAt: message.createdAt,
  id: message.id,
  role: message.actor === "agent" ? "assistant" : "user",
});

const providerProfileForChat = (profile: AgentProviderProfile): Readonly<Record<string, unknown>> => {
  const availability =
    profile.status === "available"
      ? "available"
      : profile.status === "unsupported"
        ? "unsupported"
        : "unavailable";
  const models = profile.models;

  return {
    availability,
    defaultModel: models[0] ?? null,
    description: profile.message ?? profile.executableName,
    id: profile.provider,
    label: profile.displayName,
    models: models.map((model) => ({
      disabled: availability !== "available",
      id: model,
      label: model,
    })),
    statusLabel: profile.status,
    thinkingLevels:
      profile.provider === "codex"
        ? [
            { id: "low", label: "Low" },
            { id: "medium", label: "Medium" },
            { id: "high", label: "High" },
          ]
        : [],
  };
};

const activityFromArtifact = (
  artifact: AgentArtifact,
  input: Parameters<typeof runProviderTurn>[0],
  event: Extract<AgentEvent, { readonly type: "artifact" }>,
): AgentChatActivityRecord => {
  if (artifact.type === "tool") {
    const artifactItemId = itemIdFromMetadata(artifact.metadata);
    return {
      createdAt: event.at.toISOString(),
      detail: formatToolDetail(artifact.output),
      id:
        artifactItemId === undefined
          ? chatId("activity-tool")
          : `activity-tool_${artifactItemId}`,
      kind: "tool",
      payload: {
        error: artifact.error,
        input: artifact.input,
        metadata: artifact.metadata,
        name: artifact.name,
        output: artifact.output,
      },
      status:
        artifact.status === "failed"
          ? "failed"
          : artifact.status === "completed"
            ? "completed"
            : "running",
      threadId: input.thread.id,
      title: artifact.name,
      turnId: input.turn.id,
      updatedAt: event.at.toISOString(),
    };
  }

  if (artifact.type === "patch") {
    const artifactItemId = itemIdFromMetadata(artifact.metadata);
    return {
      createdAt: event.at.toISOString(),
      detail: artifact.summary,
      id:
        artifactItemId === undefined
          ? chatId("activity-tool")
          : `activity-tool_${artifactItemId}`,
      kind: "tool",
      payload: {
        files: artifact.files,
        metadata: artifact.metadata,
        patch: artifact.patch,
      },
      status: "completed",
      threadId: input.thread.id,
      title: "File changes",
      turnId: input.turn.id,
      updatedAt: event.at.toISOString(),
    };
  }

  return {
    createdAt: event.at.toISOString(),
    detail: artifact.type === "text" ? artifact.text : undefined,
    id: chatId(
      artifact.type === "raw" && artifact.name === "reasoning"
        ? "activity-thinking"
        : "activity-progress",
    ),
    kind: artifact.type === "raw" && artifact.name === "reasoning" ? "thinking" : "progress",
    payload: artifact as unknown as Readonly<Record<string, unknown>>,
    status: "completed",
    threadId: input.thread.id,
    title: artifact.type === "raw" ? artifact.name ?? "Provider event" : artifact.type,
    turnId: input.turn.id,
    updatedAt: event.at.toISOString(),
  };
};

const itemIdFromMetadata = (
  metadata: Readonly<Record<string, unknown>> | undefined,
): string | undefined => {
  const itemId = metadata?.itemId;
  return typeof itemId === "string" && itemId.length > 0 ? itemId : undefined;
};

const formatToolDetail = (value: unknown): string | undefined => {
  if (typeof value === "string") return value.slice(0, 500);
  return undefined;
};

const usageDetail = (usage: unknown): string | undefined => {
  if (!isRecord(usage)) return undefined;
  const total = usage.totalTokens;
  return typeof total === "number" ? `${total} total tokens` : undefined;
};

const publicAgentError = (error: AgentError): Omit<AgentError, "raw"> => {
  const { raw: _raw, ...rest } = error;
  return rest;
};
