import {
  isAgentProviderId,
  type AgentApprovalDecision,
  type AgentApprovalKind,
  type AgentApprovalRequest,
  type AgentArtifact,
  type AgentContentStreamKind,
  type AgentError,
  type AgentEvent,
  type AgentProviderId,
  type AgentProviderProfile,
  type AgentRuntimeMode,
  type AgentTurnRequest,
  type AgentUserInputAnswer,
} from "@cycle/agents";
import { Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";
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
import type { ChatMessagePayload, ChatRepositoryPayload, ChatTurnPayload } from "./domain.ts";
import { isRecord } from "./domain.ts";
import { prepareChatTurn, requestOrigin } from "./prepare.ts";

type WriteMessage = (message: ServerMessage) => Promise<void>;

const StrictDecodeOptions = { onExcessProperty: "error" } as const;
const JsonRecord = Schema.Record(Schema.String, Schema.Json);
const AnswerRecord = Schema.Record(Schema.String, Schema.Json);
const OptionalEmptyPayload = Schema.optional(Schema.Struct({}));
const RuntimeMode = Schema.Literals(["read-only", "workspace-write", "full-access"]);
const BaseClientMessageFields = {
  commandId: Schema.optional(Schema.String),
  version: Schema.optional(Schema.Literal(1)),
} as const;
const ClientMessage = Schema.Union([
  Schema.Struct({
    ...BaseClientMessageFields,
    payload: Schema.optional(
      Schema.Struct({
        token: Schema.optional(Schema.String),
      }),
    ),
    type: Schema.Literal("connection.authenticate"),
  }),
  Schema.Struct({
    ...BaseClientMessageFields,
    payload: OptionalEmptyPayload,
    type: Schema.Literal("provider.list"),
  }),
  Schema.Struct({
    ...BaseClientMessageFields,
    payload: Schema.optional(
      Schema.Struct({
        includeArchived: Schema.optional(Schema.Boolean),
      }),
    ),
    type: Schema.Literal("thread.list"),
  }),
  Schema.Struct({
    ...BaseClientMessageFields,
    payload: Schema.optional(
      Schema.Struct({
        model: Schema.optional(Schema.NullOr(Schema.String)),
        origin: Schema.optional(JsonRecord),
        providerId: Schema.optional(Schema.NullOr(Schema.String)),
        runtimeMode: Schema.optional(Schema.NullOr(RuntimeMode)),
        thinkingLevel: Schema.optional(Schema.NullOr(Schema.String)),
        title: Schema.optional(Schema.String),
      }),
    ),
    type: Schema.Literal("thread.create"),
  }),
  Schema.Struct({
    ...BaseClientMessageFields,
    payload: Schema.Struct({
      threadId: Schema.String,
    }),
    type: Schema.Literal("thread.subscribe"),
  }),
  Schema.Struct({
    ...BaseClientMessageFields,
    payload: Schema.Struct({
      threadId: Schema.String,
    }),
    type: Schema.Literal("thread.unsubscribe"),
  }),
  Schema.Struct({
    ...BaseClientMessageFields,
    payload: Schema.Struct({
      model: Schema.optional(Schema.NullOr(Schema.String)),
      providerId: Schema.optional(Schema.NullOr(Schema.String)),
      runtimeMode: Schema.optional(Schema.NullOr(RuntimeMode)),
      thinkingLevel: Schema.optional(Schema.NullOr(Schema.String)),
      threadId: Schema.String,
    }),
    type: Schema.Literal("thread.update_settings"),
  }),
  Schema.Struct({
    ...BaseClientMessageFields,
    payload: Schema.Struct({
      threadId: Schema.String,
    }),
    type: Schema.Literal("thread.delete"),
  }),
  Schema.Struct({
    ...BaseClientMessageFields,
    payload: Schema.Struct({
      message: Schema.String,
      metadata: Schema.optional(JsonRecord),
      model: Schema.optional(Schema.NullOr(Schema.String)),
      providerId: Schema.String,
      runtimeMode: Schema.optional(Schema.NullOr(RuntimeMode)),
      thinkingLevel: Schema.optional(Schema.NullOr(Schema.String)),
      threadId: Schema.String,
    }),
    type: Schema.Literal("turn.send"),
  }),
  Schema.Struct({
    ...BaseClientMessageFields,
    payload: Schema.Struct({
      threadId: Schema.String,
      turnId: Schema.optional(Schema.String),
    }),
    type: Schema.Literal("turn.cancel"),
  }),
  Schema.Struct({
    ...BaseClientMessageFields,
    payload: Schema.Struct({
      answers: AnswerRecord,
      questionId: Schema.String,
      threadId: Schema.String,
    }),
    type: Schema.Literal("question.respond"),
  }),
  Schema.Struct({
    ...BaseClientMessageFields,
    payload: Schema.Struct({
      decision: Schema.Literals(["accept", "acceptForSession", "decline", "cancel"]),
      requestId: Schema.String,
      threadId: Schema.String,
    }),
    type: Schema.Literal("approval.respond"),
  }),
  Schema.Struct({
    ...BaseClientMessageFields,
    payload: OptionalEmptyPayload,
    type: Schema.Literal("ping"),
  }),
]);
type ClientMessage = typeof ClientMessage.Type;

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
            Effect.tryPromise({
              try: async () => {
                connection ??= gateway.connect(send, origin, authorizationToken);
                await gateway.handleRawMessage(connection, raw);
              },
              catch: (cause) => cause,
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

  const broadcastThreadDeleted = async (threadId: string, deletedAt: string): Promise<void> => {
    await Promise.all(
      [...connections.values()]
        .filter((connection) => connection.authenticated)
        .map((connection) =>
          safeSend(connection, {
            createdAt: deletedAt,
            payload: {
              deletedAt,
              threadId,
            },
            threadId,
            type: "thread.deleted",
            version: 1,
          }),
        ),
    );
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

  const clearThreadSubscriptions = (threadId: string) => {
    const subscribers = subscribersByThreadId.get(threadId);
    if (subscribers === undefined) return;

    for (const subscriber of subscribers) {
      subscriber.subscribedThreadIds.delete(threadId);
    }
    subscribersByThreadId.delete(threadId);
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
        if (
          token !== runtime.staticToken &&
          connection.authorizationToken !== runtime.staticToken
        ) {
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
          ...(isRecord(payload.origin) ? { origin: payload.origin } : {}),
          runtimeMode: runtimeModeOrNull(payload.runtimeMode),
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
          ...(typeof payload.runtimeMode === "string" || payload.runtimeMode === null
            ? { runtimeMode: runtimeModeOrNull(payload.runtimeMode) }
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

      case "thread.delete": {
        if (!(await requireAuthenticated(connection, command))) return;
        const chatStore = await requireStore(connection, command);
        if (chatStore === undefined) return;
        if (chatStore.deleteThread === undefined) {
          await sendCommandError(
            connection,
            command,
            "CHAT_DELETE_UNAVAILABLE",
            "The local chat store cannot delete threads.",
          );
          return;
        }

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

        if (thread.activeTurnId !== undefined && thread.activeTurnId !== null) {
          await sendCommandError(
            connection,
            command,
            "THREAD_TURN_ACTIVE",
            "Cannot delete a chat thread while a turn is active.",
          );
          return;
        }

        if (activeTurnsByThreadId.has(threadId)) {
          await sendCommandError(
            connection,
            command,
            "THREAD_TURN_ACTIVE",
            "Cannot delete a chat thread while a turn is active.",
          );
          return;
        }

        const deletedAt = runtime.now().toISOString();
        const deleted = await chatStore.deleteThread(threadId);
        if (!deleted) {
          await sendCommandError(connection, command, "THREAD_NOT_FOUND", "Thread not found.");
          return;
        }

        await acknowledge(connection, command, {
          deleted: true,
          threadId,
        });
        await broadcastThreadDeleted(threadId, deletedAt);
        clearThreadSubscriptions(threadId);
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
        const chatStore = await requireStore(connection, command);
        if (chatStore === undefined) return;
        const result = await cancelChatTurn({
          activeTurnsByThreadId,
          chatStore,
          command,
          publish,
          runtime,
        });
        if (result._tag === "error") {
          await sendCommandError(connection, command, result.code, result.message);
          return;
        }
        const { _tag: _ok, ...ackResult } = result;
        await acknowledge(connection, command, ackResult);
        return;
      }

      case "question.respond": {
        if (!(await requireAuthenticated(connection, command))) return;
        const chatStore = await requireStore(connection, command);
        if (chatStore === undefined) return;
        await respondToQuestion(chatStore, runtime, command, connection, publish);
        return;
      }

      case "approval.respond": {
        if (!(await requireAuthenticated(connection, command))) return;
        const chatStore = await requireStore(connection, command);
        if (chatStore === undefined) return;
        await respondToApproval(chatStore, runtime, command, connection, publish);
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
            message: "Chat socket received invalid message.",
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
    runtimeMode: runtimeModeFromUnknown(payload.runtimeMode) ?? thread.runtimeMode ?? null,
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
    runtimeMode: turn.runtimeMode,
    status: "active",
    summary: message.slice(0, 120),
    thinkingLevel: turn.thinkingLevel,
    title: thread.title === "New chat" ? message.slice(0, 72) : thread.title,
    updatedAt: now,
  };

  await input.chatStore.upsertMessage(userMessage);
  await input.chatStore.upsertTurn?.(turn);
  await input.chatStore.upsertThread(nextThread);
  await input.publish(
    threadId,
    "message.created",
    { message: messageForProtocol(userMessage) },
    now,
  );
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
  const service = await Effect.runPromise(
    input.runtime.agentServices.serviceFor(input.turn.providerId as AgentProviderId),
  );
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
  let sawThinkingActivity = false;
  let sawAssistantContentDelta = false;
  const assistantMessagesByItemId = new Map<string, AgentChatMessageRecord>();
  const assistantTextByItemId = new Map<string, string>();
  const messages = await input.chatStore.listMessages(input.thread.id);
  const prepared = prepareChatTurn({
    origin: input.origin,
    payload: {
      message: input.userMessage.body,
      messages: messages.map(messagePayloadFromRecord),
      model: input.turn.model ?? undefined,
      provider: input.turn.providerId as AgentProviderId,
      repositories: repositoriesFromThreadOrigin(input.thread),
      sessionId: input.thread.sessionId ?? input.thread.id,
      instructions: chatOriginInstructions(input.thread),
      runtimeMode: input.turn.runtimeMode ?? input.thread.runtimeMode ?? undefined,
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

  const upsertAggregateAssistantMessage = async (event: {
    readonly at: Date;
    readonly delta: string;
    readonly snapshot?: string;
  }) => {
    latestAssistantText = event.snapshot ?? `${latestAssistantText}${event.delta}`;
    const timestamp = event.at.toISOString();
    if (assistantMessage === undefined) {
      assistantMessage = {
        actor: "agent",
        body: latestAssistantText,
        createdAt: timestamp,
        id: chatId("message-agent"),
        streaming: true,
        threadId: input.thread.id,
        turnId: input.turn.id,
        updatedAt: timestamp,
      };
      assistantMessage = await input.chatStore.upsertMessage(assistantMessage);
      await input.publish(
        input.thread.id,
        "message.created",
        {
          message: messageForProtocol(assistantMessage),
        },
        timestamp,
      );
    } else {
      assistantMessage = {
        ...assistantMessage,
        body: latestAssistantText,
        streaming: true,
        updatedAt: timestamp,
      };
      assistantMessage = await input.chatStore.upsertMessage(assistantMessage);
    }

    await input.publish(
      input.thread.id,
      "message.delta",
      {
        delta: event.delta,
        messageId: assistantMessage.id,
        snapshot: event.snapshot,
        turnId: input.turn.id,
      },
      timestamp,
    );
  };

  const upsertSegmentedAssistantMessage = async (event: {
    readonly at: Date;
    readonly delta: string;
    readonly itemId?: string;
    readonly snapshot?: string;
  }) => {
    sawAssistantContentDelta = true;
    latestAssistantText = event.snapshot ?? `${latestAssistantText}${event.delta}`;
    const timestamp = event.at.toISOString();
    const itemKey = event.itemId ?? "default";
    const nextText = `${assistantTextByItemId.get(itemKey) ?? ""}${event.delta}`;
    assistantTextByItemId.set(itemKey, nextText);

    const existing = assistantMessagesByItemId.get(itemKey);
    const nextMessage: AgentChatMessageRecord = {
      actor: "agent",
      body: nextText,
      createdAt: existing?.createdAt ?? timestamp,
      id:
        existing?.id ?? (event.itemId ? `message-agent_${event.itemId}` : chatId("message-agent")),
      sequence: existing?.sequence,
      streaming: true,
      threadId: input.thread.id,
      turnId: input.turn.id,
      updatedAt: timestamp,
    };
    const persisted = await input.chatStore.upsertMessage(nextMessage);
    assistantMessagesByItemId.set(itemKey, persisted);
    assistantMessage = persisted;

    if (existing === undefined) {
      await input.publish(
        input.thread.id,
        "message.created",
        {
          message: messageForProtocol(persisted),
        },
        timestamp,
      );
    }

    await input.publish(
      input.thread.id,
      "message.delta",
      {
        delta: event.delta,
        messageId: persisted.id,
        snapshot: nextText,
        turnId: input.turn.id,
      },
      timestamp,
    );
  };

  const completeAssistantMessages = async (
    completedAt: string,
    finalText: string,
  ): Promise<AgentChatMessageRecord | undefined> => {
    if (assistantMessagesByItemId.size > 0) {
      let lastMessage: AgentChatMessageRecord | undefined;
      for (const [itemKey, message] of assistantMessagesByItemId) {
        const completedMessage = await input.chatStore.upsertMessage({
          ...message,
          streaming: false,
          updatedAt: completedAt,
        });
        assistantMessagesByItemId.set(itemKey, completedMessage);
        lastMessage = completedMessage;
        await input.publish(
          input.thread.id,
          "message.completed",
          {
            message: messageForProtocol(completedMessage),
          },
          completedAt,
        );
      }
      assistantMessage = lastMessage;
      return lastMessage;
    }

    assistantMessage = {
      actor: "agent",
      body: finalText,
      createdAt: assistantMessage?.createdAt ?? completedAt,
      id: assistantMessage?.id ?? chatId("message-agent"),
      sequence: assistantMessage?.sequence,
      streaming: false,
      threadId: input.thread.id,
      turnId: input.turn.id,
      updatedAt: completedAt,
    };
    assistantMessage = await input.chatStore.upsertMessage(assistantMessage);
    await input.publish(
      input.thread.id,
      "message.completed",
      {
        message: messageForProtocol(assistantMessage),
      },
      completedAt,
    );
    return assistantMessage;
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
          if (!sawAssistantContentDelta) await upsertAggregateAssistantMessage(event);
          break;
        }

        case "content.delta": {
          if (event.streamKind === "assistant_text") {
            await upsertSegmentedAssistantMessage(event);
            break;
          }
          if (event.streamKind === "reasoning_text" || event.streamKind === "reasoning_summary") {
            sawThinkingActivity = true;
            await upsertThinkingActivity(input, event.at.toISOString(), "running");
            break;
          }

          await upsertActivity(input, {
            createdAt: event.at.toISOString(),
            detail: event.delta.slice(0, 1000),
            id:
              event.itemId === undefined
                ? chatId("activity-stream")
                : `activity-stream_${event.streamKind}_${event.itemId}`,
            kind: event.streamKind === "plan" ? "progress" : "tool",
            payload: {
              delta: event.delta,
              itemId: event.itemId,
              streamKind: event.streamKind,
            },
            status: "running",
            threadId: input.thread.id,
            title: streamKindTitle(event.streamKind),
            turnId: input.turn.id,
            updatedAt: event.at.toISOString(),
          });
          break;
        }

        case "turn.plan.updated":
          await upsertActivity(input, {
            createdAt: event.at.toISOString(),
            detail: event.explanation ?? event.plan.map((step) => step.step).join("\n"),
            id: "activity-plan",
            kind: "progress",
            payload: {
              explanation: event.explanation,
              plan: event.plan,
            },
            status: "running",
            threadId: input.thread.id,
            title: "Plan updated",
            turnId: input.turn.id,
            updatedAt: event.at.toISOString(),
          });
          break;

        case "turn.diff.updated":
          await upsertActivity(input, {
            createdAt: event.at.toISOString(),
            detail: "Diff updated",
            id: "activity-diff",
            kind: "tool",
            payload: {
              diff: event.diff,
            },
            status: "running",
            threadId: input.thread.id,
            title: "Diff updated",
            turnId: input.turn.id,
            updatedAt: event.at.toISOString(),
          });
          break;

        case "item.started":
        case "item.updated":
        case "item.completed": {
          const activity = activityFromItemLifecycle(input, event);
          if (activity !== undefined) await upsertActivity(input, activity);
          break;
        }

        case "approval.requested":
          await updateTurn(input, { status: "waiting_for_user" });
          await upsertActivity(input, {
            createdAt: event.at.toISOString(),
            detail: approvalDetail(event.request),
            id: `activity-approval_${event.request.requestId}`,
            kind: "question",
            payload: event.request as unknown as Readonly<Record<string, unknown>>,
            status: "pending",
            threadId: input.thread.id,
            title: approvalTitle(event.request.kind),
            turnId: input.turn.id,
            updatedAt: event.at.toISOString(),
          });
          await input.publish(
            input.thread.id,
            "approval.requested",
            {
              request: event.request as unknown as Readonly<Record<string, unknown>>,
            },
            event.at.toISOString(),
          );
          break;

        case "approval.resolved":
          await upsertActivity(input, {
            createdAt: event.at.toISOString(),
            detail: event.decision,
            id: `activity-approval_${event.requestId}`,
            kind: "question",
            payload: {
              decision: event.decision,
              requestId: event.requestId,
            },
            status: "completed",
            threadId: input.thread.id,
            title: "Approval resolved",
            turnId: input.turn.id,
            updatedAt: event.at.toISOString(),
          });
          await updateTurn(input, { status: "running" });
          await input.publish(
            input.thread.id,
            "approval.resolved",
            {
              decision: event.decision,
              requestId: event.requestId,
            },
            event.at.toISOString(),
          );
          break;

        case "user-input.requested": {
          await updateTurn(input, { status: "waiting_for_user" });
          const question: AgentChatQuestionRecord = {
            createdAt: event.at.toISOString(),
            id: event.request.requestId,
            prompt: event.request.prompt,
            questions: event.request.questions,
            status: "open",
            threadId: input.thread.id,
            turnId: input.turn.id,
            updatedAt: event.at.toISOString(),
          };
          await input.chatStore.upsertQuestion?.(question);
          await input.publish(
            input.thread.id,
            "question.created",
            {
              question: questionForProtocol(question),
            },
            event.at.toISOString(),
          );
          break;
        }

        case "user-input.resolved":
          await updateTurn(input, { status: "running" });
          await input.publish(
            input.thread.id,
            "question.resolved",
            {
              answers: event.answers,
              questionId: event.requestId,
              status: "answered",
            },
            event.at.toISOString(),
          );
          break;

        case "runtime.warning":
          await upsertActivity(input, {
            createdAt: event.at.toISOString(),
            detail: event.message,
            id: chatId("activity-warning"),
            kind: "system",
            payload: isRecord(event.raw) ? event.raw : undefined,
            status: "completed",
            threadId: input.thread.id,
            title: "Runtime warning",
            turnId: input.turn.id,
            updatedAt: event.at.toISOString(),
          });
          break;

        case "runtime.error":
          await upsertActivity(input, {
            createdAt: event.at.toISOString(),
            detail: event.error.message,
            id: chatId("activity-runtime-error"),
            kind: "error",
            payload: publicAgentError(event.error) as Record<string, unknown>,
            status: "failed",
            threadId: input.thread.id,
            title: "Runtime error",
            turnId: input.turn.id,
            updatedAt: event.at.toISOString(),
          });
          break;

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
          if (sawThinkingActivity) {
            await upsertThinkingActivity(input, completedAt, "completed");
          }
          const finalText = event.result.text || latestAssistantText;
          const completedAssistantMessage = await completeAssistantMessages(completedAt, finalText);
          await completeTurn(
            input,
            "completed",
            completedAt,
            undefined,
            completedAssistantMessage?.id,
          );
          return;
        }

        case "turn.failed":
          if (sawThinkingActivity) {
            await upsertThinkingActivity(input, event.at.toISOString(), "failed");
          }
          await failTurn(input, event.error.message, event.at.toISOString(), event.error);
          return;

        case "turn.cancelled":
          if (sawThinkingActivity) {
            await upsertThinkingActivity(input, event.at.toISOString(), "cancelled");
          }
          await cancelTurn(input, event.error.message, event.at.toISOString(), event.error);
          return;
      }
    }

    const completedAt = input.runtime.now().toISOString();
    const completedAssistantMessage =
      assistantMessage === undefined && assistantMessagesByItemId.size === 0
        ? undefined
        : await completeAssistantMessages(completedAt, latestAssistantText);
    await completeTurn(input, "completed", completedAt, undefined, completedAssistantMessage?.id);
  } catch (error) {
    const aborted = activeTurn.record.abortController.signal.aborted;
    const message = error instanceof Error ? error.message : String(error);
    const completedAt = input.runtime.now().toISOString();
    if (sawThinkingActivity) {
      await upsertThinkingActivity(input, completedAt, aborted ? "cancelled" : "failed");
    }
    if (aborted) {
      await cancelTurn(input, message, completedAt);
    } else {
      await failTurn(input, message, completedAt);
    }
  } finally {
    input.activeTurnsByThreadId.delete(input.thread.id);
    input.runtime.activeAgentTurns.finish(
      input.turn.providerId as AgentProviderId,
      input.thread.sessionId ?? input.thread.id,
    );
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

const hiddenProviderItemTypes = new Set([
  "agentMessage",
  "agent_message",
  "contextCompaction",
  "context_compaction",
  "fileChange",
  "file_change",
  "hookPrompt",
  "hook_prompt",
  "plan",
  "reasoning",
  "userMessage",
  "user_message",
]);

const providerItemTitle = (itemType: string | undefined): string => {
  switch (itemType) {
    case "commandExecution":
    case "command_execution":
      return "Command";
    case "collabAgentToolCall":
    case "collab_agent_tool_call":
      return "Sub-agent";
    case "dynamicToolCall":
    case "dynamic_tool_call":
      return "Tool call";
    case "imageGeneration":
    case "image_generation":
      return "Image generation";
    case "imageView":
    case "image_view":
      return "Viewed image";
    case "mcpToolCall":
    case "mcp_tool_call":
      return "MCP tool";
    case "webSearch":
    case "web_search":
      return "Web search";
    default:
      return "Provider activity";
  }
};

const commandFromUnknown = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
    return value.join(" ");
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const command = commandFromUnknown(entry);
      if (command !== undefined) return command;
    }
  }
  if (isRecord(value)) {
    return (
      commandFromUnknown(value.command) ??
      commandFromUnknown(value.argv) ??
      commandFromUnknown(value.args)
    );
  }
  return undefined;
};

const providerItemDetail = (item: unknown, itemType: string | undefined): string | undefined => {
  if (!isRecord(item)) return undefined;
  switch (itemType) {
    case "commandExecution":
    case "command_execution":
      return commandFromUnknown(item.command ?? item.commandActions);
    case "dynamicToolCall":
    case "dynamic_tool_call":
    case "mcpToolCall":
    case "mcp_tool_call": {
      const namespace = stringValue(item.namespace);
      const tool = stringValue(item.tool);
      return [namespace, tool].filter((value) => value !== undefined).join(".");
    }
    case "webSearch":
    case "web_search":
      return stringValue(item.query);
    default:
      return stringValue(item.status);
  }
};

const activityFromItemLifecycle = (
  input: Parameters<typeof runProviderTurn>[0],
  event: Extract<AgentEvent, { readonly type: "item.started" | "item.updated" | "item.completed" }>,
): AgentChatActivityRecord | undefined => {
  if (event.itemType === undefined || hiddenProviderItemTypes.has(event.itemType)) {
    return undefined;
  }

  const timestamp = event.at.toISOString();
  const command =
    event.itemType === "commandExecution" || event.itemType === "command_execution"
      ? providerItemDetail(event.item, event.itemType)
      : undefined;
  const activityId =
    command === undefined
      ? `activity-provider-item_${event.itemId}`
      : `activity-command_${event.itemId}`;
  return {
    createdAt: timestamp,
    detail: providerItemDetail(event.item, event.itemType),
    id: activityId,
    kind: "tool",
    payload: {
      ...(command === undefined ? {} : { command }),
      itemId: event.itemId,
      itemType: event.itemType,
    },
    status: event.type === "item.completed" ? "completed" : "running",
    threadId: input.thread.id,
    title: providerItemTitle(event.itemType),
    turnId: input.turn.id,
    updatedAt: timestamp,
  };
};

const upsertThinkingActivity = (
  input: Parameters<typeof runProviderTurn>[0],
  timestamp: string,
  status: NonNullable<AgentChatActivityRecord["status"]>,
) =>
  upsertActivity(input, {
    createdAt: timestamp,
    id: "activity-thinking",
    kind: "thinking",
    status,
    threadId: input.thread.id,
    title: "Thinking",
    turnId: input.turn.id,
    updatedAt: timestamp,
  });

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
    summary: status === "completed" ? input.thread.summary : (error ?? input.thread.summary),
    updatedAt: completedAt,
  };
  await input.chatStore.upsertTurn?.(turn);
  await input.chatStore.upsertThread(thread);
  await input.publish(
    input.thread.id,
    `turn.${status}`,
    { turn: turnForProtocol(turn) },
    completedAt,
  );
  await input.publish(
    input.thread.id,
    "thread.updated",
    { thread: threadForProtocol(thread) },
    completedAt,
  );
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
      payload:
        error === undefined ? undefined : (publicAgentError(error) as Record<string, unknown>),
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
      payload:
        error === undefined ? undefined : (publicAgentError(error) as Record<string, unknown>),
      status: "cancelled",
      threadId: input.thread.id,
      title: "Agent turn cancelled",
      turnId: input.turn.id,
      updatedAt: completedAt,
    }),
    completeTurn(input, "cancelled", completedAt, message),
  ]).then(() => undefined);

const cancelChatTurn = async (input: {
  readonly activeTurnsByThreadId: Map<string, AbortController>;
  readonly chatStore: AgentChatStoreShape;
  readonly command: ClientMessage;
  readonly publish: (
    threadId: string,
    type: string,
    payload: Readonly<Record<string, unknown>>,
    createdAt?: string,
  ) => Promise<AgentChatEventRecord | undefined>;
  readonly runtime: CycleApiRuntimeShape;
}): Promise<
  | {
      readonly _tag: "error";
      readonly code: string;
      readonly message: string;
    }
  | {
      readonly _tag: "ok";
      readonly accepted: boolean;
      readonly reason: "cancel_requested" | "not_active" | "stale_cleared";
      readonly staleCleared: boolean;
    }
> => {
  const payload = objectPayload(input.command);
  const threadId = stringValue(payload.threadId);
  if (threadId === undefined) {
    return { _tag: "error", code: "INVALID_PAYLOAD", message: "threadId is required." };
  }

  const thread = await getThread(input.chatStore, threadId);
  if (thread === undefined) {
    return { _tag: "error", code: "THREAD_NOT_FOUND", message: "Thread not found." };
  }

  const requestedTurnId = stringValue(payload.turnId);
  const activeTurnId = thread.activeTurnId ?? null;
  if (activeTurnId === null) {
    return { _tag: "ok", accepted: false, reason: "not_active", staleCleared: false };
  }
  if (requestedTurnId !== undefined && requestedTurnId !== activeTurnId) {
    return { _tag: "ok", accepted: false, reason: "not_active", staleCleared: false };
  }

  const reason = new Error("Chat turn cancellation requested.");
  const providerId = providerFromUnknown(thread.agentId) ?? "codex";
  const sessionId = thread.sessionId ?? thread.id;
  const controller = input.activeTurnsByThreadId.get(threadId);
  const runtimeTurn = input.runtime.activeAgentTurns.get(providerId, sessionId);
  let liveCancellationRequested = false;

  if (controller !== undefined) {
    liveCancellationRequested = true;
    if (!controller.signal.aborted) controller.abort(reason);
  }
  if (runtimeTurn !== undefined) {
    liveCancellationRequested = true;
    if (!runtimeTurn.abortController.signal.aborted) runtimeTurn.abortController.abort(reason);
  }

  const service = await Effect.runPromise(input.runtime.agentServices.serviceFor(providerId));
  const providerAbort = await service.abortTurn(sessionId).catch(() => undefined);
  if (providerAbort?.accepted) liveCancellationRequested = true;

  if (liveCancellationRequested) {
    return { _tag: "ok", accepted: true, reason: "cancel_requested", staleCleared: false };
  }

  await clearStaleActiveTurn({
    chatStore: input.chatStore,
    completedAt: input.runtime.now().toISOString(),
    publish: input.publish,
    thread,
    turnId: activeTurnId,
  });
  input.runtime.activeAgentTurns.finish(providerId, sessionId, "cancelled");
  input.activeTurnsByThreadId.delete(threadId);

  return { _tag: "ok", accepted: true, reason: "stale_cleared", staleCleared: true };
};

const clearStaleActiveTurn = async (input: {
  readonly chatStore: AgentChatStoreShape;
  readonly completedAt: string;
  readonly publish: (
    threadId: string,
    type: string,
    payload: Readonly<Record<string, unknown>>,
    createdAt?: string,
  ) => Promise<AgentChatEventRecord | undefined>;
  readonly thread: AgentChatThreadRecord;
  readonly turnId: string;
}): Promise<void> => {
  const message = "Chat turn cancellation requested.";
  const turns = (await input.chatStore.listTurns?.(input.thread.id)) ?? [];
  const existingTurn = turns.find((turn) => turn.id === input.turnId);
  const thread: AgentChatThreadRecord = {
    ...input.thread,
    activeTurnId: null,
    lastError: message,
    status: "active",
    summary: message,
    updatedAt: input.completedAt,
  };
  await input.chatStore.upsertThread(thread);

  if (existingTurn !== undefined) {
    const turn: AgentChatTurnRecord = {
      ...existingTurn,
      completedAt: input.completedAt,
      lastError: message,
      status: "cancelled",
      updatedAt: input.completedAt,
    };
    await input.chatStore.upsertTurn?.(turn);
    await input.publish(
      input.thread.id,
      "turn.cancelled",
      { turn: turnForProtocol(turn) },
      input.completedAt,
    );
  }

  await input.publish(
    input.thread.id,
    "thread.updated",
    { thread: threadForProtocol(thread) },
    input.completedAt,
  );
};

const upsertActivity = async (
  input: Parameters<typeof runProviderTurn>[0],
  activity: AgentChatActivityRecord,
) => {
  await input.chatStore.upsertActivity?.(activity);
  await input.publish(
    activity.threadId,
    "activity.upserted",
    {
      activity: activityForProtocol(activity),
    },
    activity.updatedAt ?? activity.createdAt,
  );
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
  const answersPayload = isRecord(payload.answers) ? payload.answers : undefined;
  if (threadId === undefined || questionId === undefined || answersPayload === undefined) {
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
  const thread = await getThread(chatStore, threadId);
  if (thread === undefined) {
    await safeSend(connection, {
      commandId: command.commandId,
      payload: {
        code: "THREAD_NOT_FOUND",
        message: "Thread not found.",
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
  const providerId = providerFromUnknown(thread.agentId) ?? "codex";
  const service = await Effect.runPromise(runtime.agentServices.serviceFor(providerId));
  const response = await service.respondToUserInput(
    thread.sessionId ?? thread.id,
    questionId,
    userInputAnswersFromRecord(answersPayload),
  );
  if (response.status === "not_found") {
    await safeSend(connection, {
      commandId: command.commandId,
      payload: {
        code: "QUESTION_NOT_FOUND",
        message: "Provider question is no longer pending.",
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
    answer: answersPayload,
    answeredAt,
    status: "answered",
    updatedAt: answeredAt,
  };
  await chatStore.upsertQuestion?.(updated);
  await acknowledgeQuestion(connection, command, updated);
  await publish(
    threadId,
    "question.resolved",
    {
      answer: updated.answer ?? {},
      answeredAt,
      questionId,
      response,
      status: "answered",
    },
    answeredAt,
  );
};

const respondToApproval = async (
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
  const requestId = stringValue(payload.requestId);
  const decision = approvalDecisionFromUnknown(payload.decision);
  if (threadId === undefined || requestId === undefined || decision === undefined) {
    await safeSend(connection, {
      commandId: command.commandId,
      payload: {
        code: "INVALID_PAYLOAD",
        message: "threadId, requestId, and decision are required.",
        retryable: false,
        type: command.type,
      },
      type: "command.error",
      version: 1,
    });
    return;
  }

  const thread = await getThread(chatStore, threadId);
  if (thread === undefined) {
    await safeSend(connection, {
      commandId: command.commandId,
      payload: {
        code: "THREAD_NOT_FOUND",
        message: "Thread not found.",
        retryable: false,
        type: command.type,
      },
      type: "command.error",
      version: 1,
    });
    return;
  }

  const providerId = providerFromUnknown(thread.agentId) ?? "codex";
  const service = await Effect.runPromise(runtime.agentServices.serviceFor(providerId));
  const response = await service.respondToApproval(
    thread.sessionId ?? thread.id,
    requestId,
    decision,
  );
  if (response.status === "not_found") {
    await safeSend(connection, {
      commandId: command.commandId,
      payload: {
        code: "APPROVAL_NOT_FOUND",
        message: "Provider approval is no longer pending.",
        retryable: false,
        type: command.type,
      },
      type: "command.error",
      version: 1,
    });
    return;
  }

  const resolvedAt = runtime.now().toISOString();
  await chatStore.upsertActivity?.({
    createdAt: resolvedAt,
    detail: decision,
    id: `activity-approval_${requestId}`,
    kind: "question",
    payload: {
      decision,
      requestId,
      response,
    },
    status: "completed",
    threadId,
    title: "Approval resolved",
    updatedAt: resolvedAt,
  });
  await safeSend(connection, {
    commandId: command.commandId,
    payload: {
      result: {
        requestId,
        response,
      },
      type: command.type,
    },
    type: "command.ack",
    version: 1,
  });
  await publish(
    threadId,
    "approval.resolved",
    {
      decision,
      requestId,
      response,
    },
    resolvedAt,
  );
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
  const timelineSequences = timelineSequencesFromEvents(events);

  return {
    activities: activities.map((activity) =>
      activityForProtocol(activity, timelineSequences.activities.get(activity.id)),
    ),
    lastSequence: events.at(-1)?.sequence ?? 0,
    messages: messages.map((message) =>
      messageForProtocol(message, timelineSequences.messages.get(message.id)),
    ),
    questions: questions.map((question) =>
      questionForProtocol(question, timelineSequences.questions.get(question.id)),
    ),
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

type TimelineSequenceMaps = {
  readonly activities: Map<string, number>;
  readonly messages: Map<string, number>;
  readonly questions: Map<string, number>;
};

const setFirstSequence = (map: Map<string, number>, id: string | undefined, sequence: number) => {
  if (id !== undefined && !map.has(id)) map.set(id, sequence);
};

const protocolObjectId = (value: unknown): string | undefined =>
  isRecord(value) ? stringValue(value.id) : undefined;

const timelineSequencesFromEvents = (
  events: readonly AgentChatEventRecord[],
): TimelineSequenceMaps => {
  const activities = new Map<string, number>();
  const messages = new Map<string, number>();
  const questions = new Map<string, number>();

  for (const event of events) {
    const payload = event.payload;
    if (!isRecord(payload)) continue;

    switch (event.type) {
      case "message.created":
      case "message.completed":
        setFirstSequence(messages, protocolObjectId(payload.message), event.sequence);
        break;
      case "activity.upserted":
        setFirstSequence(activities, protocolObjectId(payload.activity), event.sequence);
        break;
      case "approval.requested": {
        const request = isRecord(payload.request) ? payload.request : undefined;
        const requestId = stringValue(request?.requestId);
        setFirstSequence(
          activities,
          requestId === undefined ? undefined : `activity-approval_${requestId}`,
          event.sequence,
        );
        break;
      }
      case "question.created":
        setFirstSequence(questions, protocolObjectId(payload.question), event.sequence);
        break;
    }
  }

  return { activities, messages, questions };
};

const safeSend = (connection: ChatConnection, message: ServerMessage): Promise<void> =>
  connection.send(message).catch(() => {
    connection.close();
  });

const parseClientMessage = (raw: string): ClientMessage | undefined => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Schema.decodeUnknownSync(ClientMessage, StrictDecodeOptions)(parsed);
  } catch {
    return undefined;
  }
};

const objectPayload = (command: ClientMessage): Readonly<Record<string, unknown>> =>
  command.payload ?? {};

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

const runtimeModeFromUnknown = (value: unknown): AgentRuntimeMode | undefined =>
  value === "read-only" || value === "workspace-write" || value === "full-access"
    ? value
    : undefined;

const runtimeModeOrNull = (value: unknown): AgentRuntimeMode | null =>
  runtimeModeFromUnknown(value) ?? null;

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

const approvalDecisionFromUnknown = (value: unknown): AgentApprovalDecision | undefined =>
  value === "accept" || value === "acceptForSession" || value === "decline" || value === "cancel"
    ? value
    : undefined;

const answerValueFromUnknown = (value: unknown): AgentUserInputAnswer["value"] => {
  if (typeof value === "boolean" || typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  if (isRecord(value) && Array.isArray(value.answers)) {
    return value.answers.filter((entry): entry is string => typeof entry === "string");
  }
  return String(value);
};

const userInputAnswersFromRecord = (
  answers: Readonly<Record<string, unknown>>,
): readonly AgentUserInputAnswer[] =>
  Object.entries(answers).map(([questionId, value]) => ({
    questionId,
    value: answerValueFromUnknown(value),
  }));

const streamKindTitle = (streamKind: AgentContentStreamKind): string => {
  switch (streamKind) {
    case "reasoning_text":
    case "reasoning_summary":
      return "Reasoning";
    case "plan":
      return "Plan";
    case "command_output":
      return "Command output";
    case "file_change_output":
      return "File changes";
    case "tool_output":
      return "Tool output";
    case "assistant_text":
      return "Assistant text";
    case "unknown":
    default:
      return "Provider output";
  }
};

const approvalTitle = (kind: AgentApprovalKind): string => {
  switch (kind) {
    case "command":
      return "Command approval requested";
    case "file-change":
      return "File change approval requested";
    case "permissions":
      return "Permission approval requested";
    case "unknown":
    default:
      return "Approval requested";
  }
};

const approvalDetail = (request: AgentApprovalRequest): string | undefined => {
  const command = request.details?.command;
  if (typeof command === "string" && command.length > 0) return command;
  const changes = request.details?.changes;
  if (Array.isArray(changes))
    return `${changes.length} file change${changes.length === 1 ? "" : "s"}`;
  return undefined;
};

const chatId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;

const threadForProtocol = (thread: AgentChatThreadRecord): Readonly<Record<string, unknown>> => ({
  activeTurnId: thread.activeTurnId ?? null,
  archivedAt: thread.archivedAt ?? null,
  createdAt: thread.createdAt,
  id: thread.id,
  lastError: thread.lastError ?? null,
  model: thread.model ?? null,
  origin: thread.origin ?? null,
  providerId: thread.agentId ?? null,
  runtimeMode: thread.runtimeMode ?? null,
  sessionId: thread.sessionId ?? null,
  status: thread.status,
  summary: thread.summary,
  thinkingLevel: thread.thinkingLevel ?? null,
  title: thread.title,
  updatedAt: thread.updatedAt,
});

const messageForProtocol = (
  message: AgentChatMessageRecord,
  timelineSequence?: number,
): Readonly<Record<string, unknown>> => ({
  createdAt: message.createdAt,
  id: message.id,
  role: message.actor === "agent" ? "assistant" : "user",
  sequence: message.sequence,
  streaming: message.streaming ?? false,
  text: message.body,
  timelineSequence: timelineSequence ?? null,
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
  runtimeMode: turn.runtimeMode ?? null,
  status: turn.status,
  thinkingLevel: turn.thinkingLevel ?? null,
  threadId: turn.threadId,
  updatedAt: turn.updatedAt,
});

const activityForProtocol = (
  activity: AgentChatActivityRecord,
  timelineSequence?: number,
): Readonly<Record<string, unknown>> => ({
  createdAt: activity.createdAt,
  detail: activity.detail ?? null,
  id: activity.id,
  kind: activity.kind,
  payload: activity.payload ?? null,
  timelineSequence: timelineSequence ?? null,
  status: activity.status ?? null,
  title: activity.title,
  turnId: activity.turnId ?? null,
  updatedAt: activity.updatedAt ?? activity.createdAt,
});

const questionForProtocol = (
  question: AgentChatQuestionRecord,
  timelineSequence?: number,
): Readonly<Record<string, unknown>> => ({
  answeredAt: question.answeredAt ?? null,
  createdAt: question.createdAt,
  id: question.id,
  prompt: question.prompt,
  questions: question.questions,
  timelineSequence: timelineSequence ?? null,
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

const repositoriesFromThreadOrigin = (
  thread: AgentChatThreadRecord,
): readonly ChatRepositoryPayload[] | undefined => {
  const repositoryId = threadOriginString(thread, "repositoryId");
  return repositoryId === undefined ? undefined : [{ id: repositoryId }];
};

const chatOriginInstructions = (thread: AgentChatThreadRecord): string | undefined => {
  const repositoryId = threadOriginString(thread, "repositoryId");
  const issueId = threadOriginString(thread, "issueId");
  if (repositoryId === undefined || issueId === undefined) return undefined;

  return [
    "This chat thread was started from a Cycle issue mention.",
    `Issue context: cycle://repository/${repositoryId}/tickets/${issueId}`,
    "Resolve that Cycle URI through the attached MCP tools before claiming repository or ticket context is missing.",
  ].join("\n");
};

const threadOriginString = (thread: AgentChatThreadRecord, key: string): string | undefined => {
  const value = thread.origin?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const providerProfileForChat = (
  profile: AgentProviderProfile,
): Readonly<Record<string, unknown>> => {
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
    const command =
      artifact.name === "command_execution" ? commandFromUnknown(artifact.input) : undefined;
    return {
      createdAt: event.at.toISOString(),
      detail: command ?? formatToolDetail(artifact.output),
      id:
        artifactItemId === undefined
          ? chatId(command === undefined ? "activity-tool" : "activity-command")
          : command === undefined
            ? `activity-tool_${artifactItemId}`
            : `activity-command_${artifactItemId}`,
      kind: "tool",
      payload: {
        ...(command === undefined ? {} : { command }),
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
      title: command === undefined ? artifact.name : "Command",
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
        artifactItemId === undefined ? chatId("activity-tool") : `activity-tool_${artifactItemId}`,
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
    title: artifact.type === "raw" ? (artifact.name ?? "Provider event") : artifact.type,
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
