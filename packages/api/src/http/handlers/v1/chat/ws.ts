import {
  AgentChatCreateInput,
  type AgentChatEvent,
  AgentChatSendInput,
  type AgentChatShape,
} from "@cycle/agent-chat";
import { Effect, Fiber, Layer, Option, Schema, Stream } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";
import { CycleApiError } from "../../../../CycleApiError.ts";
import {
  chatProviderProfile,
  chatProtocolMessageRecord,
  chatSnapshotRecord,
  chatThreadRecord,
  chatTurnRecord,
} from "../../../../agents/services/AgentChatTransport.ts";
import type { CycleApiRuntimeShape } from "../../../runtime/CycleApiRuntime.ts";

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
  readonly observers: Map<string, Fiber.Fiber<void>>;
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

const rawEventMessage = (event: AgentChatEvent): ServerMessage => ({
  createdAt: event.createdAt,
  eventId: event.eventId,
  payload: event.payload,
  sequence: event.sequence,
  threadId: event.threadId,
  type: event.type,
  version: 1,
});

const taskEventMessage = (
  event: AgentChatEvent,
  type: "turn.started" | "turn.completed" | "turn.failed" | "turn.cancelled",
  status: "queued" | "running" | "completed" | "failed" | "cancelled",
): ServerMessage => ({
  createdAt: event.createdAt,
  eventId: event.eventId,
  payload: {
    turn: {
      id: event.taskId,
      ...(typeof event.payload.message === "string" ? { lastError: event.payload.message } : {}),
      status,
      threadId: event.threadId,
    },
  },
  sequence: event.sequence,
  threadId: event.threadId,
  type,
  version: 1,
});

export const projectEventForChatProtocol = (
  chat: AgentChatShape,
  event: AgentChatEvent,
): Effect.Effect<ReadonlyArray<ServerMessage>, unknown> => {
  switch (event.type) {
    case "task.submitted":
      return Effect.succeed([rawEventMessage(event)]);
    case "task.queued":
      return Effect.succeed([taskEventMessage(event, "turn.started", "queued")]);
    case "task.started":
      return Effect.succeed([taskEventMessage(event, "turn.started", "running")]);
    case "task.completed":
      return Effect.succeed([taskEventMessage(event, "turn.completed", "completed")]);
    case "task.failed":
      return Effect.succeed([taskEventMessage(event, "turn.failed", "failed")]);
    case "task.cancelled":
      return Effect.succeed([taskEventMessage(event, "turn.cancelled", "cancelled")]);
    case "message.delta":
    case "message.completed":
    case "message.failed":
      return chat.get(event.threadId).pipe(
        Effect.map(
          Option.match({
            onNone: () => [rawEventMessage(event)],
            onSome: (view) => {
              const messageId =
                typeof event.payload.messageId === "string" ? event.payload.messageId : undefined;
              const message = view.messages.find((candidate) => candidate.messageId === messageId);
              if (message === undefined) return [rawEventMessage(event)];
              const projected: ServerMessage = {
                createdAt: event.createdAt,
                eventId: event.eventId,
                payload: { message: chatProtocolMessageRecord(message) },
                sequence: event.sequence,
                threadId: event.threadId,
                type:
                  event.type === "message.delta" || message.role === "user"
                    ? "message.created"
                    : "message.completed",
                version: 1,
              };
              return event.type === "message.delta"
                ? [projected, rawEventMessage(event)]
                : [projected];
            },
          }),
        ),
      );
    default:
      return Effect.succeed([rawEventMessage(event)]);
  }
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
        const context = yield* Effect.context<never>();
        let connection: ChatConnection | undefined;

        const send: WriteMessage = async (message) => {
          await Effect.runPromiseWith(context)(write(JSON.stringify(message)));
        };

        const handleMessage = Effect.fn("handleMessage")(function* (raw: string) {
          yield* Effect.tryPromise({
            try: async () => {
              connection ??= gateway.connect(send, origin, authorizationToken);
              await gateway.handleRawMessage(connection, raw);
            },
            catch: (cause) =>
              new CycleApiError({
                cause,
                message:
                  cause instanceof Error ? cause.message : "handle chat websocket message failed",
                operation: "handle chat websocket message",
              }),
          }).pipe(
            Effect.catch((error) =>
              Effect.gen(function* () {
                yield* Effect.logError("chat websocket command failed").pipe(
                  Effect.annotateLogs({
                    cause: error.message,
                    operation: error.operation,
                  }),
                );

                const activeConnection = connection;
                if (activeConnection === undefined) return;

                const commandId = parseClientMessage(raw)?.commandId;
                yield* Effect.promise(() =>
                  safeSend(activeConnection, {
                    ...(commandId === undefined ? {} : { commandId }),
                    payload: {
                      code: "INTERNAL_ERROR",
                      message: "Chat socket command failed.",
                      retryable: true,
                    },
                    type: "command.error",
                    version: 1,
                  }),
                );
              }),
            ),
          );
        });

        const readLoop = socket.runString(handleMessage).pipe(
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

  const requireChat = async (
    connection: ChatConnection,
    command: ClientMessage,
  ): Promise<AgentChatShape | undefined> => {
    if (runtime.agentChat !== undefined) return runtime.agentChat;
    await sendCommandError(
      connection,
      command,
      "CHAT_STORE_UNAVAILABLE",
      "The local chat store is unavailable.",
      true,
    );
    return undefined;
  };

  const runChat = async <A>(
    connection: ChatConnection,
    command: ClientMessage,
    effect: Effect.Effect<
      A,
      { readonly code: string; readonly message: string; readonly retryable: boolean }
    >,
  ): Promise<A | undefined> => {
    const result = await Effect.runPromise(Effect.result(effect));
    if (result._tag === "Failure") {
      await sendCommandError(
        connection,
        command,
        result.failure.code,
        result.failure.message,
        result.failure.retryable,
      );
      return undefined;
    }
    return result.success;
  };

  const subscribe = (
    connection: ChatConnection,
    chat: AgentChatShape,
    threadId: string,
    afterSequence: number,
  ) => {
    if (connection.observers.has(threadId)) return;
    connection.subscribedThreadIds.add(threadId);
    const observer = Effect.runFork(
      chat.observe({ afterSequence, tail: true, threadId }).pipe(
        Stream.runForEach((event) =>
          projectEventForChatProtocol(chat, event).pipe(
            Effect.flatMap((messages) =>
              Effect.forEach(
                messages,
                (message) => Effect.promise(() => safeSend(connection, message)),
                {
                  discard: true,
                },
              ),
            ),
          ),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            connection.observers.delete(threadId);
            connection.subscribedThreadIds.delete(threadId);
          }),
        ),
        Effect.catch(() => Effect.void),
      ),
    );
    connection.observers.set(threadId, observer);
  };

  const unsubscribe = (connection: ChatConnection, threadId: string) => {
    connection.subscribedThreadIds.delete(threadId);
    const observer = connection.observers.get(threadId);
    if (observer !== undefined) Effect.runFork(Fiber.interrupt(observer));
    connection.observers.delete(threadId);
  };

  const close = (connection: ChatConnection) => {
    connections.delete(connection.id);
    for (const observer of connection.observers.values()) Effect.runFork(Fiber.interrupt(observer));
    connection.observers.clear();
    connection.subscribedThreadIds.clear();
  };

  const clearThreadSubscriptions = (threadId: string) => {
    for (const connection of connections.values()) unsubscribe(connection, threadId);
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

  const handleCommand = async (connection: ChatConnection, command: ClientMessage) => {
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
            providers: profiles.map(chatProviderProfile),
          },
          type: "provider.list.snapshot",
          version: 1,
        });
        await acknowledge(connection, command);
        return;
      }

      case "thread.list": {
        if (!(await requireAuthenticated(connection, command))) return;
        const chat = await requireChat(connection, command);
        if (chat === undefined) return;
        const threads = await runChat(
          connection,
          command,
          chat
            .list({ includeArchived: objectPayload(command).includeArchived === true })
            .pipe(Stream.map(chatThreadRecord), Stream.runCollect),
        );
        if (threads === undefined) return;
        await safeSend(connection, {
          commandId: command.commandId,
          payload: { threads },
          type: "thread.list.snapshot",
          version: 1,
        });
        await acknowledge(connection, command);
        return;
      }

      case "thread.create": {
        if (!(await requireAuthenticated(connection, command))) return;
        const chat = await requireChat(connection, command);
        if (chat === undefined) return;
        const payload = objectPayload(command);
        const providerId = stringValue(payload.providerId) ?? "codex";
        const requestedModel = stringValue(payload.model);
        const model =
          requestedModel ??
          (await runtime.agentProviderProfiles()).find((profile) => profile.provider === providerId)
            ?.defaultModel ??
          undefined;
        const view = await runChat(
          connection,
          command,
          chat.create(
            new AgentChatCreateInput({
              model,
              providerId,
              title: stringValue(payload.title) ?? "Agent conversation",
            }),
          ),
        );
        if (view !== undefined)
          await acknowledge(connection, command, { thread: chatThreadRecord(view.thread) });
        return;
      }

      case "thread.subscribe": {
        if (!(await requireAuthenticated(connection, command))) return;
        const chat = await requireChat(connection, command);
        if (chat === undefined) return;
        const payload = objectPayload(command);
        const threadId = stringValue(payload.threadId);
        if (threadId === undefined) {
          await sendCommandError(connection, command, "INVALID_PAYLOAD", "threadId is required.");
          return;
        }
        const option = await runChat(connection, command, chat.get(threadId));
        if (option === undefined) return;
        if (Option.isNone(option)) {
          await sendCommandError(connection, command, "NOT_FOUND", "Chat thread not found.");
          return;
        }
        const view = option.value;
        subscribe(connection, chat, threadId, view.lastSequence);
        await safeSend(connection, {
          commandId: command.commandId,
          payload: chatSnapshotRecord(view),
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
        const chat = await requireChat(connection, command);
        if (chat === undefined) return;
        const payload = objectPayload(command);
        const option = await runChat(
          connection,
          command,
          chat.get(stringValue(payload.threadId) ?? ""),
        );
        if (option === undefined) return;
        if (Option.isNone(option)) {
          await sendCommandError(connection, command, "NOT_FOUND", "Chat thread not found.");
          return;
        }
        await acknowledge(connection, command, { thread: chatThreadRecord(option.value.thread) });
        return;
      }

      case "thread.delete": {
        if (!(await requireAuthenticated(connection, command))) return;
        const chat = await requireChat(connection, command);
        if (chat === undefined) return;
        const payload = objectPayload(command);
        const threadId = stringValue(payload.threadId);
        if (threadId === undefined) {
          await sendCommandError(connection, command, "INVALID_PAYLOAD", "threadId is required.");
          return;
        }
        const view = await runChat(connection, command, chat.archive(threadId));
        if (view === undefined) return;
        await acknowledge(connection, command, { deleted: true, threadId });
        const deletedAt = runtime.now().toISOString();
        await broadcastThreadDeleted(threadId, deletedAt);
        clearThreadSubscriptions(threadId);
        return;
      }

      case "turn.send": {
        if (!(await requireAuthenticated(connection, command))) return;
        const chat = await requireChat(connection, command);
        if (chat === undefined) return;
        const payload = objectPayload(command);
        const threadId = stringValue(payload.threadId) ?? "";
        const view = await runChat(
          connection,
          command,
          chat.send(
            new AgentChatSendInput({
              idempotencyKey: command.commandId ?? `ws-turn-${crypto.randomUUID()}`,
              message: stringValue(payload.message) ?? "",
              threadId,
            }),
          ),
        );
        if (view !== undefined) {
          const taskId = view.thread.activeTaskId ?? "";
          await acknowledge(connection, command, {
            thread: chatThreadRecord(view.thread),
            turn: chatTurnRecord(view, taskId),
          });
        }
        return;
      }

      case "turn.cancel": {
        if (!(await requireAuthenticated(connection, command))) return;
        const chat = await requireChat(connection, command);
        if (chat === undefined) return;
        const payload = objectPayload(command);
        const threadId = stringValue(payload.threadId) ?? "";
        const option = await runChat(connection, command, chat.get(threadId));
        if (option === undefined) return;
        const taskId = Option.isSome(option) ? option.value.thread.activeTaskId : undefined;
        if (taskId === undefined) {
          await acknowledge(connection, command, {
            accepted: false,
            reason: "not_active",
            staleCleared: false,
          });
          return;
        }
        const interrupted = await runChat(
          connection,
          command,
          chat.interrupt({ taskId, threadId }).pipe(Effect.as(true)),
        );
        if (interrupted !== undefined) {
          await acknowledge(connection, command, {
            accepted: true,
            reason: "cancel_requested",
            staleCleared: false,
          });
        }
        return;
      }

      case "question.respond": {
        if (!(await requireAuthenticated(connection, command))) return;
        const chat = await requireChat(connection, command);
        if (chat === undefined) return;
        const payload = objectPayload(command);
        const threadId = stringValue(payload.threadId) ?? "";
        const questionId = stringValue(payload.questionId) ?? "";
        const option = await runChat(connection, command, chat.get(threadId));
        if (option === undefined) return;
        const interaction = Option.isSome(option)
          ? option.value.interactions.find((candidate) => candidate.interactionId === questionId)
          : undefined;
        if (interaction === undefined) {
          await sendCommandError(
            connection,
            command,
            "interaction_not_found",
            "Question not found.",
          );
          return;
        }
        const responded = await runChat(
          connection,
          command,
          chat
            .respond({
              commandId: command.commandId ?? `question-${questionId}`,
              interactionId: questionId,
              responderId: "user",
              response: (isRecord(payload.answers) ? payload.answers : {}) as Schema.Json,
              taskId: interaction.taskId,
              threadId,
            })
            .pipe(Effect.as(true)),
        );
        if (responded !== undefined)
          await acknowledge(connection, command, {
            question: { id: questionId, status: "answered" },
          });
        return;
      }

      case "approval.respond": {
        if (!(await requireAuthenticated(connection, command))) return;
        const chat = await requireChat(connection, command);
        if (chat === undefined) return;
        const payload = objectPayload(command);
        const threadId = stringValue(payload.threadId) ?? "";
        const requestId = stringValue(payload.requestId) ?? "";
        const option = await runChat(connection, command, chat.get(threadId));
        if (option === undefined) return;
        const interaction = Option.isSome(option)
          ? option.value.interactions.find((candidate) => candidate.interactionId === requestId)
          : undefined;
        if (interaction === undefined) {
          await sendCommandError(
            connection,
            command,
            "interaction_not_found",
            "Approval not found.",
          );
          return;
        }
        const decision = approvalDecisionFromUnknown(payload.decision) ?? "cancel";
        const responded = await runChat(
          connection,
          command,
          chat
            .respond({
              commandId: command.commandId ?? `approval-${requestId}`,
              interactionId: requestId,
              responderId: "user",
              response: decision,
              taskId: interaction.taskId,
              threadId,
            })
            .pipe(Effect.as(true)),
        );
        if (responded !== undefined)
          await acknowledge(connection, command, { requestId, response: decision });
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
        id: `connection_${crypto.randomUUID()}`,
        observers: new Map(),
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
      await handleCommand(connection, command);
    },
  };
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

const requestOrigin = (request: {
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly url: string;
}): string => {
  const host = request.headers["x-forwarded-host"] ?? request.headers.host;
  if (host !== undefined && host.length > 0) {
    return `${request.headers["x-forwarded-proto"] ?? "http"}://${host}`;
  }
  return new URL(request.url).origin;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const approvalDecisionFromUnknown = (
  value: unknown,
): "accept" | "acceptForSession" | "decline" | "cancel" | undefined =>
  value === "accept" || value === "acceptForSession" || value === "decline" || value === "cancel"
    ? value
    : undefined;
