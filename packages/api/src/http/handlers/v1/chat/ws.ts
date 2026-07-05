import {
  providerProfileForChat,
  requestOrigin,
  type AgentChatPublishedEvent,
  type AgentChatRuntimeShape,
} from "@cycle/agent-chat";
import { Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";
import { ApiHandlerError } from "../../../../errors/index.ts";
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
        const context = yield* Effect.context<never>();
        let connection: ChatConnection | undefined;

        const send: WriteMessage = async (message) => {
          await Effect.runPromiseWith(context)(write(JSON.stringify(message)));
        };

        const readLoop = socket
          .runString((raw) =>
            Effect.tryPromise({
              try: async () => {
                connection ??= gateway.connect(send, origin, authorizationToken);
                await gateway.handleRawMessage(connection, raw);
              },
              catch: (cause) =>
                new ApiHandlerError({
                  cause,
                  message:
                    cause instanceof Error ? cause.message : "handle chat websocket message failed",
                  operation: "handle chat websocket message",
                }),
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

  runtime.agentChatEventBus?.subscribe(async (event) => {
    await broadcastPublishedEvent(subscribersByThreadId, event);
  });

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

  const requireChatRuntime = async (
    connection: ChatConnection,
    command: ClientMessage,
  ): Promise<AgentChatRuntimeShape | undefined> => {
    if (runtime.agentChatRuntime !== undefined) return runtime.agentChatRuntime;
    await sendCommandError(
      connection,
      command,
      "CHAT_STORE_UNAVAILABLE",
      "The local chat store is unavailable.",
      true,
    );
    return undefined;
  };

  const acknowledgeResult = async (
    connection: ChatConnection,
    command: ClientMessage,
    result:
      | {
          readonly _tag: "error";
          readonly code: string;
          readonly message: string;
          readonly retryable?: boolean;
        }
      | {
          readonly _tag: "ok";
          readonly result: unknown;
        },
  ): Promise<boolean> => {
    if (result._tag === "error") {
      await sendCommandError(connection, command, result.code, result.message, result.retryable);
      return false;
    }
    await acknowledge(connection, command, result.result);
    return true;
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
        const chat = await requireChatRuntime(connection, command);
        if (chat === undefined) return;
        const result = await chat.listThreads({
          includeArchived: objectPayload(command).includeArchived === true,
        });
        if (result._tag === "error") {
          await sendCommandError(
            connection,
            command,
            result.code,
            result.message,
            result.retryable,
          );
          return;
        }
        await safeSend(connection, {
          commandId: command.commandId,
          payload: result.result,
          type: "thread.list.snapshot",
          version: 1,
        });
        await acknowledge(connection, command);
        return;
      }

      case "thread.create": {
        if (!(await requireAuthenticated(connection, command))) return;
        const chat = await requireChatRuntime(connection, command);
        if (chat === undefined) return;
        await acknowledgeResult(
          connection,
          command,
          await chat.createThread(objectPayload(command)),
        );
        return;
      }

      case "thread.subscribe": {
        if (!(await requireAuthenticated(connection, command))) return;
        const chat = await requireChatRuntime(connection, command);
        if (chat === undefined) return;
        const payload = objectPayload(command);
        const threadId = stringValue(payload.threadId);
        if (threadId === undefined) {
          await sendCommandError(connection, command, "INVALID_PAYLOAD", "threadId is required.");
          return;
        }
        const result = await chat.getThreadSnapshot({ threadId });
        if (result._tag === "error") {
          await sendCommandError(
            connection,
            command,
            result.code,
            result.message,
            result.retryable,
          );
          return;
        }
        subscribe(connection, threadId);
        await safeSend(connection, {
          commandId: command.commandId,
          payload: result.result,
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
        const chat = await requireChatRuntime(connection, command);
        if (chat === undefined) return;
        const payload = objectPayload(command);
        await acknowledgeResult(
          connection,
          command,
          await chat.updateThreadSettings({
            model: stringOrNull(payload.model),
            providerId: stringOrNull(payload.providerId),
            runtimeMode: runtimeModeOrNull(payload.runtimeMode),
            thinkingLevel: stringOrNull(payload.thinkingLevel),
            threadId: stringValue(payload.threadId) ?? "",
          }),
        );
        return;
      }

      case "thread.delete": {
        if (!(await requireAuthenticated(connection, command))) return;
        const chat = await requireChatRuntime(connection, command);
        if (chat === undefined) return;
        const payload = objectPayload(command);
        const threadId = stringValue(payload.threadId);
        if (threadId === undefined) {
          await sendCommandError(connection, command, "INVALID_PAYLOAD", "threadId is required.");
          return;
        }
        const result = await chat.deleteThread({ threadId });
        if (!(await acknowledgeResult(connection, command, result))) return;
        const deletedAt = runtime.now().toISOString();
        await broadcastThreadDeleted(threadId, deletedAt);
        clearThreadSubscriptions(threadId);
        return;
      }

      case "turn.send": {
        if (!(await requireAuthenticated(connection, command))) return;
        const chat = await requireChatRuntime(connection, command);
        if (chat === undefined) return;
        const payload = objectPayload(command);
        await acknowledgeResult(
          connection,
          command,
          await chat.sendTurn({
            message: stringValue(payload.message) ?? "",
            metadata: isRecord(payload.metadata) ? payload.metadata : undefined,
            model: stringOrNull(payload.model),
            origin,
            providerId: stringValue(payload.providerId) ?? "",
            runtimeMode: runtimeModeOrNull(payload.runtimeMode),
            thinkingLevel: stringOrNull(payload.thinkingLevel),
            threadId: stringValue(payload.threadId) ?? "",
          }),
        );
        return;
      }

      case "turn.cancel": {
        if (!(await requireAuthenticated(connection, command))) return;
        const chat = await requireChatRuntime(connection, command);
        if (chat === undefined) return;
        const payload = objectPayload(command);
        await acknowledgeResult(
          connection,
          command,
          await chat.cancelTurn({
            threadId: stringValue(payload.threadId) ?? "",
            turnId: stringValue(payload.turnId),
          }),
        );
        return;
      }

      case "question.respond": {
        if (!(await requireAuthenticated(connection, command))) return;
        const chat = await requireChatRuntime(connection, command);
        if (chat === undefined) return;
        const payload = objectPayload(command);
        await acknowledgeResult(
          connection,
          command,
          await chat.respondToQuestion({
            answers: isRecord(payload.answers) ? payload.answers : {},
            questionId: stringValue(payload.questionId) ?? "",
            threadId: stringValue(payload.threadId) ?? "",
          }),
        );
        return;
      }

      case "approval.respond": {
        if (!(await requireAuthenticated(connection, command))) return;
        const chat = await requireChatRuntime(connection, command);
        if (chat === undefined) return;
        const payload = objectPayload(command);
        await acknowledgeResult(
          connection,
          command,
          await chat.respondToApproval({
            decision: approvalDecisionFromUnknown(payload.decision) ?? "cancel",
            requestId: stringValue(payload.requestId) ?? "",
            threadId: stringValue(payload.threadId) ?? "",
          }),
        );
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

const broadcastPublishedEvent = async (
  subscribersByThreadId: Map<string, Set<ChatConnection>>,
  event: AgentChatPublishedEvent,
): Promise<void> => {
  const subscribers = subscribersByThreadId.get(event.threadId);
  if (subscribers === undefined) return;

  await Promise.all(
    [...subscribers].map((connection) =>
      safeSend(connection, {
        createdAt: event.createdAt,
        eventId: event.eventId,
        payload: event.payload,
        sequence: event.sequence,
        threadId: event.threadId,
        type: event.type,
        version: 1,
      }),
    ),
  );
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

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

const runtimeModeOrNull = (
  value: unknown,
): "read-only" | "workspace-write" | "full-access" | null =>
  value === "read-only" || value === "workspace-write" || value === "full-access" ? value : null;

const approvalDecisionFromUnknown = (
  value: unknown,
): "accept" | "acceptForSession" | "decline" | "cancel" | undefined =>
  value === "accept" || value === "acceptForSession" || value === "decline" || value === "cancel"
    ? value
    : undefined;
