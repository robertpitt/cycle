import {
  type AgentServiceRegistryShape,
  isAgentProviderId,
  type AgentApprovalDecision,
  type AgentApprovalKind,
  type AgentApprovalRequest,
  type AgentArtifact,
  type AgentContentStreamKind,
  type AgentError,
  type AgentEvent,
  type AgentMcpAttachment,
  type AgentProviderId,
  type AgentProviderProfile,
  type AgentRuntimeMode,
  type AgentTurnRequest,
  type AgentTurnResult,
  type AgentUserInputAnswer,
} from "@cycle/agents";
import { Context, Effect, Fiber, Layer, PubSub } from "effect";
import type { ChatMessagePayload, ChatRepositoryPayload, ChatTurnPayload } from "../domain.ts";
import { isRecord } from "../domain.ts";
import {
  AgentChatFailure,
  agentChatError,
  agentChatFailureFromUnknown,
  agentChatOk,
  type AgentChatResult,
} from "../errors.ts";
import {
  assignedTicketImplementationWorkflowInstructions,
  bodyFromResult,
  prepareChatTurn,
} from "../prompt.ts";
import type {
  AgentChatActivityRecord,
  AgentChatEventRecord,
  AgentChatMessageRecord,
  AgentChatQuestionRecord,
  AgentChatStoreShape,
  AgentChatThreadRecord,
  AgentChatTurnRecord,
} from "../records.ts";
import type { AgentActiveTurnDirectoryShape } from "./ActiveTurnDirectory.ts";

export type AgentChatRepositoryDirectoryEntry = {
  readonly displayName: string;
  readonly id: string;
  readonly path: string;
};

export type AgentChatPublishedEvent = {
  readonly createdAt: string;
  readonly eventId?: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly sequence?: number;
  readonly threadId: string;
  readonly type: string;
};

export type AgentChatPublisher = (event: AgentChatPublishedEvent) => Promise<void> | void;

export type AgentChatEventBusShape = {
  readonly publish: AgentChatPublisher;
  readonly subscribe: (listener: AgentChatPublisher) => () => void;
};

export type AgentChatMcpResolverInput = {
  readonly origin: string;
  readonly requestId: string;
  readonly required: boolean;
  readonly threadId: string;
};

export type AgentChatMcpResolver = (
  input: AgentChatMcpResolverInput,
) => AgentMcpAttachment | undefined | Promise<AgentMcpAttachment | undefined>;

export type AgentChatRuntimeDependencies = {
  readonly activeTurns: AgentActiveTurnDirectoryShape;
  readonly agentProviderProfiles: () => Promise<readonly AgentProviderProfile[]>;
  readonly agentServices: AgentServiceRegistryShape;
  readonly listRepositories?: () => Promise<readonly AgentChatRepositoryDirectoryEntry[]>;
  readonly makeId?: (prefix: string) => string;
  readonly mcp?: AgentMcpAttachment | AgentChatMcpResolver;
  readonly now?: () => Date;
  readonly publish?: AgentChatPublisher;
  readonly store: AgentChatStoreShape;
};

export type AgentChatSnapshot = {
  readonly activities: readonly Readonly<Record<string, unknown>>[];
  readonly lastSequence: number;
  readonly messages: readonly Readonly<Record<string, unknown>>[];
  readonly questions: readonly Readonly<Record<string, unknown>>[];
  readonly thread: Readonly<Record<string, unknown>>;
  readonly turns: readonly Readonly<Record<string, unknown>>[];
};

export type AgentChatRuntimeShape = {
  readonly store: AgentChatStoreShape;
  readonly cancelTurn: (input: { readonly threadId: string; readonly turnId?: string }) => Promise<
    AgentChatResult<{
      readonly accepted: boolean;
      readonly reason: "cancel_requested" | "not_active" | "stale_cleared";
      readonly staleCleared: boolean;
    }>
  >;
  readonly close: () => Promise<void>;
  readonly createThread: (input: {
    readonly model?: string | null;
    readonly origin?: Readonly<Record<string, unknown>>;
    readonly providerId?: string | null;
    readonly runtimeMode?: AgentRuntimeMode | null;
    readonly thinkingLevel?: string | null;
    readonly title?: string;
  }) => Promise<AgentChatResult<{ readonly thread: Readonly<Record<string, unknown>> }>>;
  readonly deleteThread: (input: {
    readonly threadId: string;
  }) => Promise<AgentChatResult<{ readonly deleted: true; readonly threadId: string }>>;
  readonly getThreadSnapshot: (input: {
    readonly threadId: string;
  }) => Promise<AgentChatResult<AgentChatSnapshot>>;
  readonly handleSuccessfulCommentMentions: (input: {
    readonly body: string;
    readonly comment: unknown;
    readonly commentId: string;
    readonly origin: string;
    readonly requestId: string;
    readonly repositoryId: string;
    readonly ticketId: string;
  }) => Promise<void>;
  readonly listThreads: (input?: {
    readonly includeArchived?: boolean;
  }) => Promise<
    AgentChatResult<{ readonly threads: readonly Readonly<Record<string, unknown>>[] }>
  >;
  readonly respondToApproval: (input: {
    readonly decision: AgentApprovalDecision;
    readonly requestId: string;
    readonly threadId: string;
  }) => Promise<AgentChatResult<{ readonly requestId: string; readonly response: unknown }>>;
  readonly respondToQuestion: (input: {
    readonly answers: Readonly<Record<string, unknown>>;
    readonly questionId: string;
    readonly threadId: string;
  }) => Promise<AgentChatResult<{ readonly question: Readonly<Record<string, unknown>> }>>;
  readonly sendTurn: (input: {
    readonly message: string;
    readonly metadata?: Readonly<Record<string, unknown>>;
    readonly model?: string | null;
    readonly origin: string;
    readonly providerId: string;
    readonly runtimeMode?: AgentRuntimeMode | null;
    readonly thinkingLevel?: string | null;
    readonly threadId: string;
  }) => Promise<
    AgentChatResult<{
      readonly thread: Readonly<Record<string, unknown>>;
      readonly turn: Readonly<Record<string, unknown>>;
    }>
  >;
  readonly updateThreadSettings: (input: {
    readonly model?: string | null;
    readonly providerId?: string | null;
    readonly runtimeMode?: AgentRuntimeMode | null;
    readonly thinkingLevel?: string | null;
    readonly threadId: string;
  }) => Promise<AgentChatResult<{ readonly thread: Readonly<Record<string, unknown>> }>>;
};

export type AgentChatRuntimeServiceShape = {
  readonly runtime: AgentChatRuntimeShape;
  readonly cancelTurn: AgentChatRuntimeShape["cancelTurn"] extends (
    input: infer Input,
  ) => Promise<infer Output>
    ? (input: Input) => Effect.Effect<Output, AgentChatFailure>
    : never;
  readonly createThread: AgentChatRuntimeShape["createThread"] extends (
    input: infer Input,
  ) => Promise<infer Output>
    ? (input: Input) => Effect.Effect<Output, AgentChatFailure>
    : never;
  readonly deleteThread: AgentChatRuntimeShape["deleteThread"] extends (
    input: infer Input,
  ) => Promise<infer Output>
    ? (input: Input) => Effect.Effect<Output, AgentChatFailure>
    : never;
  readonly getThreadSnapshot: AgentChatRuntimeShape["getThreadSnapshot"] extends (
    input: infer Input,
  ) => Promise<infer Output>
    ? (input: Input) => Effect.Effect<Output, AgentChatFailure>
    : never;
  readonly listThreads: AgentChatRuntimeShape["listThreads"] extends (
    input?: infer Input,
  ) => Promise<infer Output>
    ? (input?: Input) => Effect.Effect<Output, AgentChatFailure>
    : never;
  readonly respondToApproval: AgentChatRuntimeShape["respondToApproval"] extends (
    input: infer Input,
  ) => Promise<infer Output>
    ? (input: Input) => Effect.Effect<Output, AgentChatFailure>
    : never;
  readonly respondToQuestion: AgentChatRuntimeShape["respondToQuestion"] extends (
    input: infer Input,
  ) => Promise<infer Output>
    ? (input: Input) => Effect.Effect<Output, AgentChatFailure>
    : never;
  readonly sendTurn: AgentChatRuntimeShape["sendTurn"] extends (
    input: infer Input,
  ) => Promise<infer Output>
    ? (input: Input) => Effect.Effect<Output, AgentChatFailure>
    : never;
  readonly updateThreadSettings: AgentChatRuntimeShape["updateThreadSettings"] extends (
    input: infer Input,
  ) => Promise<infer Output>
    ? (input: Input) => Effect.Effect<Output, AgentChatFailure>
    : never;
};

export class AgentChatRuntime extends Context.Service<
  AgentChatRuntime,
  AgentChatRuntimeServiceShape
>()("@cycle/agent-chat/AgentChatRuntime") {}

type RuntimeState = {
  readonly activeTurnsByThreadId: Map<string, AbortController>;
  readonly dependencies: Required<Pick<AgentChatRuntimeDependencies, "now">> &
    Omit<AgentChatRuntimeDependencies, "now">;
  readonly providerFibersByTurnId: Map<string, Fiber.Fiber<void>>;
};

export const makeAgentChatRuntime = (
  dependencies: AgentChatRuntimeDependencies,
): AgentChatRuntimeShape => {
  const state: RuntimeState = {
    activeTurnsByThreadId: new Map(),
    dependencies: {
      ...dependencies,
      now: dependencies.now ?? (() => new Date()),
    },
    providerFibersByTurnId: new Map(),
  };

  const runtime: AgentChatRuntimeShape = {
    store: dependencies.store,
    cancelTurn: (input) => cancelChatTurn(state, input),
    close: () => closeRuntime(state),
    createThread: (input) => createThread(state, input),
    deleteThread: (input) => deleteThread(state, input),
    getThreadSnapshot: (input) => getThreadSnapshot(state, input.threadId),
    handleSuccessfulCommentMentions: (input) => handleSuccessfulCommentMentions(state, input),
    listThreads: (input) => listThreads(state, input),
    respondToApproval: (input) => respondToApproval(state, input),
    respondToQuestion: (input) => respondToQuestion(state, input),
    sendTurn: (input) => sendTurn(state, input),
    updateThreadSettings: (input) => updateThreadSettings(state, input),
  };

  return runtime;
};

const closeRuntime = (state: RuntimeState): Promise<void> =>
  Effect.runPromise(
    Effect.forEach([...state.providerFibersByTurnId.values()], Fiber.interrupt, {
      concurrency: "unbounded",
      discard: true,
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          state.providerFibersByTurnId.clear();
          state.activeTurnsByThreadId.clear();
        }),
      ),
    ),
  );

const forkProviderTask = (
  state: RuntimeState,
  turnId: string,
  operation: () => Promise<void>,
): void => {
  const previous = state.providerFibersByTurnId.get(turnId);
  if (previous !== undefined) Effect.runFork(Fiber.interrupt(previous));

  const fiber = Effect.runFork(
    Effect.tryPromise({
      try: operation,
      catch: (cause) =>
        agentChatFailureFromUnknown(cause, {
          code: "provider_execution_failed",
          message: "agent chat provider task failed",
        }),
    }).pipe(
      Effect.catch(() => Effect.void),
      Effect.ensuring(Effect.sync(() => state.providerFibersByTurnId.delete(turnId))),
    ),
  );
  state.providerFibersByTurnId.set(turnId, fiber);
};

const runtimeEffect = <A>(
  operation: () => Promise<A>,
  message: string,
): Effect.Effect<A, AgentChatFailure> =>
  Effect.tryPromise({
    try: operation,
    catch: (cause) =>
      agentChatFailureFromUnknown(cause, {
        code: "unknown",
        message,
      }),
  });

export const makeAgentChatRuntimeService = (
  dependencies: AgentChatRuntimeDependencies,
): AgentChatRuntimeServiceShape => {
  const runtime = makeAgentChatRuntime(dependencies);

  return {
    runtime,
    cancelTurn: (input) =>
      runtimeEffect(() => runtime.cancelTurn(input), "cancel chat turn failed"),
    createThread: (input) =>
      runtimeEffect(() => runtime.createThread(input), "create chat thread failed"),
    deleteThread: (input) =>
      runtimeEffect(() => runtime.deleteThread(input), "delete chat thread failed"),
    getThreadSnapshot: (input) =>
      runtimeEffect(() => runtime.getThreadSnapshot(input), "get chat thread snapshot failed"),
    listThreads: (input) =>
      runtimeEffect(() => runtime.listThreads(input), "list chat threads failed"),
    respondToApproval: (input) =>
      runtimeEffect(() => runtime.respondToApproval(input), "respond to provider approval failed"),
    respondToQuestion: (input) =>
      runtimeEffect(() => runtime.respondToQuestion(input), "respond to provider question failed"),
    sendTurn: (input) => runtimeEffect(() => runtime.sendTurn(input), "send chat turn failed"),
    updateThreadSettings: (input) =>
      runtimeEffect(
        () => runtime.updateThreadSettings(input),
        "update chat thread settings failed",
      ),
  };
};

export const AgentChatRuntimeLive = (dependencies: AgentChatRuntimeDependencies) =>
  Layer.succeed(AgentChatRuntime, AgentChatRuntime.of(makeAgentChatRuntimeService(dependencies)));

export const makeAgentChatEventBusEffect = (
  capacity = 256,
): Effect.Effect<AgentChatEventBusShape> =>
  Effect.gen(function* () {
    const pubsub = yield* PubSub.bounded<AgentChatPublishedEvent>(capacity);

    return {
      publish: (event) => Effect.runPromise(PubSub.publish(pubsub, event).pipe(Effect.asVoid)),
      subscribe: (listener) => {
        const fiber = Effect.runFork(
          Effect.scoped(
            Effect.gen(function* () {
              const subscription = yield* PubSub.subscribe(pubsub);

              while (true) {
                const event = yield* PubSub.take(subscription);
                yield* Effect.tryPromise({
                  try: () => Promise.resolve(listener(event)),
                  catch: (cause) =>
                    agentChatFailureFromUnknown(cause, {
                      code: "unknown",
                      message: "agent chat subscriber failed",
                    }),
                }).pipe(Effect.catch(() => Effect.void));
              }
            }),
          ),
        );

        return () => {
          Effect.runFork(Fiber.interrupt(fiber));
        };
      },
    };
  });

export const makeAgentChatEventBus = (): AgentChatEventBusShape =>
  Effect.runSync(makeAgentChatEventBusEffect());

const nowIso = (state: RuntimeState): string => state.dependencies.now().toISOString();

const chatId = (state: RuntimeState, prefix: string): string =>
  state.dependencies.makeId?.(prefix) ?? `${prefix}_${crypto.randomUUID()}`;

const publish = async (
  state: RuntimeState,
  threadId: string,
  type: string,
  payload: Readonly<Record<string, unknown>>,
  createdAt = nowIso(state),
): Promise<AgentChatEventRecord | undefined> => {
  const event =
    state.dependencies.store.appendEvent === undefined
      ? undefined
      : await state.dependencies.store.appendEvent({
          createdAt,
          eventId: chatId(state, "event"),
          payload,
          threadId,
          type,
        });

  await state.dependencies.publish?.({
    createdAt,
    eventId: event?.eventId,
    payload,
    sequence: event?.sequence,
    threadId,
    type,
  });

  return event;
};

const resolveMcp = async (
  state: RuntimeState,
  input: AgentChatMcpResolverInput,
): Promise<AgentMcpAttachment | undefined> => {
  const resolver = state.dependencies.mcp;
  if (resolver === undefined) return undefined;
  if (typeof resolver === "function") return resolver(input);
  return {
    ...resolver,
    ...(input.required ? { required: true } : {}),
  };
};

const listThreads = async (
  state: RuntimeState,
  input: { readonly includeArchived?: boolean } = {},
) => {
  const threads = (await state.dependencies.store.listThreads())
    .map(threadForProtocol)
    .filter((thread) => input.includeArchived === true || thread.status !== "archived");

  return agentChatOk({ threads });
};

const createThread = async (
  state: RuntimeState,
  input: Parameters<AgentChatRuntimeShape["createThread"]>[0],
) => {
  const timestamp = nowIso(state);
  const providerId = providerFromUnknown(input.providerId);
  const thread: AgentChatThreadRecord = {
    ...(providerId === undefined ? {} : { agentId: providerId }),
    createdAt: timestamp,
    id: chatId(state, "thread"),
    model: stringOrNull(input.model),
    ...(input.origin === undefined ? {} : { origin: input.origin }),
    runtimeMode: runtimeModeOrNull(input.runtimeMode),
    status: "draft",
    summary: "New conversation",
    thinkingLevel: stringOrNull(input.thinkingLevel),
    title: stringValue(input.title) ?? "New chat",
    updatedAt: timestamp,
  };
  await state.dependencies.store.upsertThread(thread);
  await publish(
    state,
    thread.id,
    "thread.updated",
    { thread: threadForProtocol(thread) },
    timestamp,
  );
  return agentChatOk({ thread: threadForProtocol(thread) });
};

const updateThreadSettings = async (
  state: RuntimeState,
  input: Parameters<AgentChatRuntimeShape["updateThreadSettings"]>[0],
) => {
  const thread = await getThread(state.dependencies.store, input.threadId);
  if (thread === undefined) return agentChatError("THREAD_NOT_FOUND", "Thread not found.");

  const providerId = providerFromUnknown(input.providerId);
  const nextThread: AgentChatThreadRecord = {
    ...thread,
    ...(providerId === undefined ? {} : { agentId: providerId }),
    ...(typeof input.model === "string" || input.model === null
      ? { model: stringOrNull(input.model) }
      : {}),
    ...(typeof input.runtimeMode === "string" || input.runtimeMode === null
      ? { runtimeMode: runtimeModeOrNull(input.runtimeMode) }
      : {}),
    ...(typeof input.thinkingLevel === "string" || input.thinkingLevel === null
      ? { thinkingLevel: stringOrNull(input.thinkingLevel) }
      : {}),
    updatedAt: nowIso(state),
  };
  await state.dependencies.store.upsertThread(nextThread);
  await publish(state, nextThread.id, "thread.updated", {
    thread: threadForProtocol(nextThread),
  });
  return agentChatOk({ thread: threadForProtocol(nextThread) });
};

const deleteThread = async (
  state: RuntimeState,
  input: Parameters<AgentChatRuntimeShape["deleteThread"]>[0],
) => {
  if (state.dependencies.store.deleteThread === undefined) {
    return agentChatError("CHAT_DELETE_UNAVAILABLE", "The local chat store cannot delete threads.");
  }

  const thread = await getThread(state.dependencies.store, input.threadId);
  if (thread === undefined) return agentChatError("THREAD_NOT_FOUND", "Thread not found.");
  if (thread.activeTurnId !== undefined && thread.activeTurnId !== null) {
    return agentChatError(
      "THREAD_TURN_ACTIVE",
      "Cannot delete a chat thread while a turn is active.",
    );
  }
  if (state.activeTurnsByThreadId.has(input.threadId)) {
    return agentChatError(
      "THREAD_TURN_ACTIVE",
      "Cannot delete a chat thread while a turn is active.",
    );
  }

  const deleted = await state.dependencies.store.deleteThread(input.threadId);
  if (!deleted) return agentChatError("THREAD_NOT_FOUND", "Thread not found.");

  return agentChatOk({ deleted: true as const, threadId: input.threadId });
};

const getThreadSnapshot = async (state: RuntimeState, threadId: string) => {
  const snapshot = await threadSnapshot(state.dependencies.store, threadId);
  if (snapshot === undefined) return agentChatError("THREAD_NOT_FOUND", "Thread not found.");
  return agentChatOk(snapshot);
};

const sendTurn = async (
  state: RuntimeState,
  input: Parameters<AgentChatRuntimeShape["sendTurn"]>[0],
) => {
  const threadId = stringValue(input.threadId);
  const message = stringValue(input.message)?.trim();
  const providerId = providerFromUnknown(input.providerId);

  if (threadId === undefined || message === undefined || providerId === undefined) {
    return agentChatError("INVALID_PAYLOAD", "threadId, message, and providerId are required.");
  }

  const thread = await getThread(state.dependencies.store, threadId);
  if (thread === undefined) return agentChatError("THREAD_NOT_FOUND", "Thread not found.");
  if (thread.activeTurnId !== undefined && thread.activeTurnId !== null) {
    return agentChatError("THREAD_TURN_ACTIVE", "A chat turn is already active for this thread.");
  }

  const timestamp = nowIso(state);
  const turnId = chatId(state, "turn");
  const userMessage: AgentChatMessageRecord = {
    actor: "user",
    body: message,
    createdAt: timestamp,
    id: chatId(state, "message"),
    threadId,
    turnId,
    updatedAt: timestamp,
  };
  const turn: AgentChatTurnRecord = {
    createdAt: timestamp,
    id: turnId,
    inputMessageId: userMessage.id,
    metadata: input.metadata,
    model: stringOrNull(input.model),
    providerId,
    runtimeMode: runtimeModeFromUnknown(input.runtimeMode) ?? thread.runtimeMode ?? null,
    status: "queued",
    thinkingLevel: stringOrNull(input.thinkingLevel),
    threadId,
    updatedAt: timestamp,
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
    updatedAt: timestamp,
  };

  await state.dependencies.store.upsertMessage(userMessage);
  await state.dependencies.store.upsertTurn?.(turn);
  await state.dependencies.store.upsertThread(nextThread);
  await publish(
    state,
    threadId,
    "message.created",
    { message: messageForProtocol(userMessage) },
    timestamp,
  );
  await publish(state, threadId, "turn.started", { turn: turnForProtocol(turn) }, timestamp);
  await publish(
    state,
    threadId,
    "thread.updated",
    { thread: threadForProtocol(nextThread) },
    timestamp,
  );

  forkProviderTask(state, turn.id, () =>
    runProviderTurn(state, {
      origin: input.origin,
      thread: nextThread,
      turn,
      userMessage,
    }),
  );

  return agentChatOk({
    thread: threadForProtocol(nextThread),
    turn: turnForProtocol(turn),
  });
};

const runProviderTurn = async (
  state: RuntimeState,
  input: {
    readonly origin: string;
    readonly thread: AgentChatThreadRecord;
    readonly turn: AgentChatTurnRecord;
    readonly userMessage: AgentChatMessageRecord;
  },
): Promise<void> => {
  const providerId = input.turn.providerId as AgentProviderId;
  const providerBlocker = await providerExecutionBlocker(state, providerId);
  if (providerBlocker !== undefined) {
    await failTurn(state, input, providerBlocker);
    return;
  }

  const service = await Effect.runPromise(state.dependencies.agentServices.serviceFor(providerId));
  const activeTurn = state.dependencies.activeTurns.begin({
    provider: providerId,
    requestId: input.turn.id,
    sessionId: input.thread.sessionId ?? input.thread.id,
    threadId: input.thread.id,
  });
  if (!activeTurn.active) {
    await failTurn(state, input, "A chat turn is already active for this thread.");
    return;
  }

  state.activeTurnsByThreadId.set(input.thread.id, activeTurn.record.abortController);

  let assistantMessage: AgentChatMessageRecord | undefined;
  let latestAssistantText = "";
  let sawThinkingActivity = false;
  let sawAssistantContentDelta = false;
  const assistantMessagesByItemId = new Map<string, AgentChatMessageRecord>();
  const assistantTextByItemId = new Map<string, string>();
  const messages = await state.dependencies.store.listMessages(input.thread.id);
  const repositories = await repositoriesFromThreadOrigin(state, input.thread);
  const mcp = await resolveMcp(state, {
    origin: input.origin,
    requestId: input.turn.id,
    required: false,
    threadId: input.thread.id,
  });
  const prepared = prepareChatTurn({
    mcp,
    payload: {
      message: input.userMessage.body,
      messages: messages.map(messagePayloadFromRecord),
      model: input.turn.model ?? undefined,
      provider: input.turn.providerId as AgentProviderId,
      repositories,
      sessionId: input.thread.sessionId ?? input.thread.id,
      instructions: chatOriginInstructions(input.thread),
      runtimeMode: input.turn.runtimeMode ?? input.thread.runtimeMode ?? undefined,
      threadId: input.thread.id,
    } satisfies ChatTurnPayload,
    requestId: input.turn.id,
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
        id: chatId(state, "message-agent"),
        streaming: true,
        threadId: input.thread.id,
        turnId: input.turn.id,
        updatedAt: timestamp,
      };
      assistantMessage = await state.dependencies.store.upsertMessage(assistantMessage);
      await publish(
        state,
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
      assistantMessage = await state.dependencies.store.upsertMessage(assistantMessage);
    }

    await publish(
      state,
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
        existing?.id ??
        (event.itemId ? `message-agent_${event.itemId}` : chatId(state, "message-agent")),
      sequence: existing?.sequence,
      streaming: true,
      threadId: input.thread.id,
      turnId: input.turn.id,
      updatedAt: timestamp,
    };
    const persisted = await state.dependencies.store.upsertMessage(nextMessage);
    assistantMessagesByItemId.set(itemKey, persisted);
    assistantMessage = persisted;

    if (existing === undefined) {
      await publish(
        state,
        input.thread.id,
        "message.created",
        {
          message: messageForProtocol(persisted),
        },
        timestamp,
      );
    }

    await publish(
      state,
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
        const completedMessage = await state.dependencies.store.upsertMessage({
          ...message,
          streaming: false,
          updatedAt: completedAt,
        });
        assistantMessagesByItemId.set(itemKey, completedMessage);
        lastMessage = completedMessage;
        await publish(
          state,
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
      id: assistantMessage?.id ?? chatId(state, "message-agent"),
      sequence: assistantMessage?.sequence,
      streaming: false,
      threadId: input.thread.id,
      turnId: input.turn.id,
      updatedAt: completedAt,
    };
    assistantMessage = await state.dependencies.store.upsertMessage(assistantMessage);
    await publish(
      state,
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
    await updateTurn(state, input, { status: "running" });

    for await (const event of service.stream(prepared.sessionId, agentRequest)) {
      switch (event.type) {
        case "turn.started":
          await updateTurn(state, input, { status: "running" });
          break;

        case "text.delta":
          if (!sawAssistantContentDelta) await upsertAggregateAssistantMessage(event);
          break;

        case "content.delta":
          if (event.streamKind === "assistant_text") {
            await upsertSegmentedAssistantMessage(event);
            break;
          }
          if (event.streamKind === "reasoning_text" || event.streamKind === "reasoning_summary") {
            sawThinkingActivity = true;
            await upsertThinkingActivity(state, input, event.at.toISOString(), "running");
            break;
          }

          await upsertActivity(state, {
            createdAt: event.at.toISOString(),
            detail: event.delta.slice(0, 1000),
            id:
              event.itemId === undefined
                ? chatId(state, "activity-stream")
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

        case "turn.plan.updated":
          await upsertActivity(state, {
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
          await upsertActivity(state, {
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
          const activity = activityFromItemLifecycle(state, input, event);
          if (activity !== undefined) await upsertActivity(state, activity);
          break;
        }

        case "approval.requested":
          await updateTurn(state, input, { status: "waiting_for_user" });
          await upsertActivity(state, {
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
          await publish(
            state,
            input.thread.id,
            "approval.requested",
            {
              request: event.request as unknown as Readonly<Record<string, unknown>>,
            },
            event.at.toISOString(),
          );
          break;

        case "approval.resolved":
          await upsertActivity(state, {
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
          await updateTurn(state, input, { status: "running" });
          await publish(
            state,
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
          await updateTurn(state, input, { status: "waiting_for_user" });
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
          await state.dependencies.store.upsertQuestion?.(question);
          await publish(
            state,
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
          await updateTurn(state, input, { status: "running" });
          await publish(
            state,
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
          await upsertActivity(state, {
            createdAt: event.at.toISOString(),
            detail: event.message,
            id: chatId(state, "activity-warning"),
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
          await upsertActivity(state, {
            createdAt: event.at.toISOString(),
            detail: event.error.message,
            id: chatId(state, "activity-runtime-error"),
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
          await upsertActivity(state, {
            createdAt: event.at.toISOString(),
            detail: event.message,
            id: chatId(state, "activity-progress"),
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
          await upsertActivity(state, activityFromArtifact(state, event.artifact, input, event));
          break;

        case "usage":
          await upsertActivity(state, {
            createdAt: event.at.toISOString(),
            detail: usageDetail(event.usage),
            id: chatId(state, "activity-usage"),
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
            await upsertThinkingActivity(state, input, completedAt, "completed");
          }
          const finalText = event.result.text || latestAssistantText;
          const completedAssistantMessage = await completeAssistantMessages(completedAt, finalText);
          await completeTurn(
            state,
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
            await upsertThinkingActivity(state, input, event.at.toISOString(), "failed");
          }
          await failTurn(state, input, event.error.message, event.at.toISOString(), event.error);
          return;

        case "turn.cancelled":
          if (sawThinkingActivity) {
            await upsertThinkingActivity(state, input, event.at.toISOString(), "cancelled");
          }
          await cancelProjectedTurn(
            state,
            input,
            event.error.message,
            event.at.toISOString(),
            event.error,
          );
          return;
      }
    }

    const completedAt = nowIso(state);
    const completedAssistantMessage =
      assistantMessage === undefined && assistantMessagesByItemId.size === 0
        ? undefined
        : await completeAssistantMessages(completedAt, latestAssistantText);
    await completeTurn(
      state,
      input,
      "completed",
      completedAt,
      undefined,
      completedAssistantMessage?.id,
    );
  } catch (error) {
    const aborted = activeTurn.record.abortController.signal.aborted;
    const message = error instanceof Error ? error.message : String(error);
    const completedAt = nowIso(state);
    if (sawThinkingActivity) {
      await upsertThinkingActivity(state, input, completedAt, aborted ? "cancelled" : "failed");
    }
    if (aborted) {
      await cancelProjectedTurn(state, input, message, completedAt);
    } else {
      await failTurn(state, input, message, completedAt);
    }
  } finally {
    state.activeTurnsByThreadId.delete(input.thread.id);
    state.dependencies.activeTurns.finish(
      input.turn.providerId as AgentProviderId,
      input.thread.sessionId ?? input.thread.id,
    );
  }
};

const providerExecutionBlocker = async (
  state: RuntimeState,
  providerId: AgentProviderId,
): Promise<string | undefined> => {
  const profiles = await state.dependencies.agentProviderProfiles().catch(() => []);
  const profile = profiles.find((candidate) => candidate.provider === providerId);
  return providerProfileBlocker(state, profile, providerId);
};

const providerProfileBlocker = (
  state: RuntimeState,
  profile: AgentProviderProfile | undefined,
  providerId: AgentProviderId,
): string | undefined => {
  if (profile === undefined) return `Agent provider '${providerId}' is not configured.`;
  if (profile.status === "disabled") return `${profile.displayName} is disabled in Cycle settings.`;
  if (profile.status !== "available")
    return profile.message ?? `${profile.displayName} is not available.`;

  const maxConcurrentRuns = profile.maxConcurrentRuns;
  if (
    maxConcurrentRuns !== null &&
    maxConcurrentRuns !== undefined &&
    state.dependencies.activeTurns.countByProvider(providerId) >= maxConcurrentRuns
  ) {
    return `${profile.displayName} has reached its configured concurrency limit.`;
  }

  return undefined;
};

const updateTurn = async (
  state: RuntimeState,
  input: Parameters<typeof runProviderTurn>[1],
  patch: Partial<AgentChatTurnRecord>,
) => {
  const updated: AgentChatTurnRecord = {
    ...input.turn,
    ...patch,
    updatedAt: nowIso(state),
  };
  Object.assign(input.turn as Mutable<AgentChatTurnRecord>, updated);
  await state.dependencies.store.upsertTurn?.(updated);
  await publish(state, input.thread.id, "turn.started", { turn: turnForProtocol(updated) });
};

type Mutable<T> = {
  -readonly [Key in keyof T]: T[Key];
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
  _state: RuntimeState,
  input: Parameters<typeof runProviderTurn>[1],
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
  state: RuntimeState,
  input: Parameters<typeof runProviderTurn>[1],
  timestamp: string,
  status: NonNullable<AgentChatActivityRecord["status"]>,
) =>
  upsertActivity(state, {
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
  state: RuntimeState,
  input: Parameters<typeof runProviderTurn>[1],
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
  await state.dependencies.store.upsertTurn?.(turn);
  await state.dependencies.store.upsertThread(thread);
  await publish(
    state,
    input.thread.id,
    `turn.${status}`,
    { turn: turnForProtocol(turn) },
    completedAt,
  );
  await publish(
    state,
    input.thread.id,
    "thread.updated",
    { thread: threadForProtocol(thread) },
    completedAt,
  );
};

const failTurn = (
  state: RuntimeState,
  input: Parameters<typeof runProviderTurn>[1],
  message: string,
  completedAt = nowIso(state),
  error?: AgentError,
) =>
  Promise.all([
    upsertActivity(state, {
      createdAt: completedAt,
      detail: message,
      id: chatId(state, "activity-error"),
      kind: "error",
      payload:
        error === undefined ? undefined : (publicAgentError(error) as Record<string, unknown>),
      status: "failed",
      threadId: input.thread.id,
      title: "Agent turn failed",
      turnId: input.turn.id,
      updatedAt: completedAt,
    }),
    completeTurn(state, input, "failed", completedAt, message),
  ]).then(() => undefined);

const cancelProjectedTurn = (
  state: RuntimeState,
  input: Parameters<typeof runProviderTurn>[1],
  message: string,
  completedAt = nowIso(state),
  error?: AgentError,
) =>
  Promise.all([
    upsertActivity(state, {
      createdAt: completedAt,
      detail: message,
      id: chatId(state, "activity-cancelled"),
      kind: "system",
      payload:
        error === undefined ? undefined : (publicAgentError(error) as Record<string, unknown>),
      status: "cancelled",
      threadId: input.thread.id,
      title: "Agent turn cancelled",
      turnId: input.turn.id,
      updatedAt: completedAt,
    }),
    completeTurn(state, input, "cancelled", completedAt, message),
  ]).then(() => undefined);

const cancelChatTurn = async (
  state: RuntimeState,
  input: Parameters<AgentChatRuntimeShape["cancelTurn"]>[0],
) => {
  const threadId = stringValue(input.threadId);
  if (threadId === undefined) {
    return agentChatError("INVALID_PAYLOAD", "threadId is required.");
  }

  const thread = await getThread(state.dependencies.store, threadId);
  if (thread === undefined) return agentChatError("THREAD_NOT_FOUND", "Thread not found.");

  const requestedTurnId = stringValue(input.turnId);
  const activeTurnId = thread.activeTurnId ?? null;
  if (activeTurnId === null) {
    return agentChatOk({ accepted: false, reason: "not_active" as const, staleCleared: false });
  }
  if (requestedTurnId !== undefined && requestedTurnId !== activeTurnId) {
    return agentChatOk({ accepted: false, reason: "not_active" as const, staleCleared: false });
  }

  const reason = new Error("Chat turn cancellation requested.");
  const providerId = providerFromUnknown(thread.agentId) ?? "codex";
  const sessionId = thread.sessionId ?? thread.id;
  const controller = state.activeTurnsByThreadId.get(threadId);
  const runtimeTurn = state.dependencies.activeTurns.get(providerId, sessionId);
  let liveCancellationRequested = false;

  if (controller !== undefined) {
    liveCancellationRequested = true;
    if (!controller.signal.aborted) controller.abort(reason);
  }
  if (runtimeTurn !== undefined) {
    liveCancellationRequested = true;
    if (!runtimeTurn.abortController.signal.aborted) runtimeTurn.abortController.abort(reason);
  }
  const providerFiber = state.providerFibersByTurnId.get(activeTurnId);
  if (providerFiber !== undefined) {
    liveCancellationRequested = true;
    Effect.runFork(Fiber.interrupt(providerFiber));
  }

  const service = await Effect.runPromise(state.dependencies.agentServices.serviceFor(providerId));
  const providerAbort = await service.abortTurn(sessionId).catch(() => undefined);
  if (providerAbort?.accepted) liveCancellationRequested = true;

  if (liveCancellationRequested) {
    return agentChatOk({
      accepted: true,
      reason: "cancel_requested" as const,
      staleCleared: false,
    });
  }

  await clearStaleActiveTurn(state, {
    completedAt: nowIso(state),
    thread,
    turnId: activeTurnId,
  });
  state.dependencies.activeTurns.finish(providerId, sessionId, "cancelled");
  state.activeTurnsByThreadId.delete(threadId);

  return agentChatOk({ accepted: true, reason: "stale_cleared" as const, staleCleared: true });
};

const clearStaleActiveTurn = async (
  state: RuntimeState,
  input: {
    readonly completedAt: string;
    readonly thread: AgentChatThreadRecord;
    readonly turnId: string;
  },
): Promise<void> => {
  const message = "Chat turn cancellation requested.";
  const turns = (await state.dependencies.store.listTurns?.(input.thread.id)) ?? [];
  const existingTurn = turns.find((turn) => turn.id === input.turnId);
  const thread: AgentChatThreadRecord = {
    ...input.thread,
    activeTurnId: null,
    lastError: message,
    status: "active",
    summary: message,
    updatedAt: input.completedAt,
  };
  await state.dependencies.store.upsertThread(thread);

  if (existingTurn !== undefined) {
    const turn: AgentChatTurnRecord = {
      ...existingTurn,
      completedAt: input.completedAt,
      lastError: message,
      status: "cancelled",
      updatedAt: input.completedAt,
    };
    await state.dependencies.store.upsertTurn?.(turn);
    await publish(
      state,
      input.thread.id,
      "turn.cancelled",
      { turn: turnForProtocol(turn) },
      input.completedAt,
    );
  }

  await publish(
    state,
    input.thread.id,
    "thread.updated",
    { thread: threadForProtocol(thread) },
    input.completedAt,
  );
};

const upsertActivity = async (state: RuntimeState, activity: AgentChatActivityRecord) => {
  await state.dependencies.store.upsertActivity?.(activity);
  await publish(
    state,
    activity.threadId,
    "activity.upserted",
    {
      activity: activityForProtocol(activity),
    },
    activity.updatedAt ?? activity.createdAt,
  );
};

const respondToQuestion = async (
  state: RuntimeState,
  input: Parameters<AgentChatRuntimeShape["respondToQuestion"]>[0],
) => {
  const threadId = stringValue(input.threadId);
  const questionId = stringValue(input.questionId);
  const answersPayload = isRecord(input.answers) ? input.answers : undefined;
  if (threadId === undefined || questionId === undefined || answersPayload === undefined) {
    return agentChatError("INVALID_PAYLOAD", "threadId, questionId, and answers are required.");
  }
  const thread = await getThread(state.dependencies.store, threadId);
  if (thread === undefined) return agentChatError("THREAD_NOT_FOUND", "Thread not found.");
  const questions = (await state.dependencies.store.listQuestions?.(threadId)) ?? [];
  const question = questions.find((candidate) => candidate.id === questionId);
  if (question === undefined || question.status !== "open") {
    return agentChatError(
      question === undefined ? "QUESTION_NOT_FOUND" : "QUESTION_NOT_OPEN",
      question === undefined ? "Question not found." : "Question is not open.",
    );
  }
  const providerId = providerFromUnknown(thread.agentId) ?? "codex";
  const service = await Effect.runPromise(state.dependencies.agentServices.serviceFor(providerId));
  const response = await service.respondToUserInput(
    thread.sessionId ?? thread.id,
    questionId,
    userInputAnswersFromRecord(answersPayload),
  );
  if (response.status === "not_found") {
    return agentChatError("QUESTION_NOT_FOUND", "Provider question is no longer pending.");
  }
  const answeredAt = nowIso(state);
  const updated: AgentChatQuestionRecord = {
    ...question,
    answer: answersPayload,
    answeredAt,
    status: "answered",
    updatedAt: answeredAt,
  };
  await state.dependencies.store.upsertQuestion?.(updated);
  await publish(
    state,
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
  return agentChatOk({ question: questionForProtocol(updated) });
};

const respondToApproval = async (
  state: RuntimeState,
  input: Parameters<AgentChatRuntimeShape["respondToApproval"]>[0],
) => {
  const threadId = stringValue(input.threadId);
  const requestId = stringValue(input.requestId);
  const decision = approvalDecisionFromUnknown(input.decision);
  if (threadId === undefined || requestId === undefined || decision === undefined) {
    return agentChatError("INVALID_PAYLOAD", "threadId, requestId, and decision are required.");
  }

  const thread = await getThread(state.dependencies.store, threadId);
  if (thread === undefined) return agentChatError("THREAD_NOT_FOUND", "Thread not found.");

  const providerId = providerFromUnknown(thread.agentId) ?? "codex";
  const service = await Effect.runPromise(state.dependencies.agentServices.serviceFor(providerId));
  const response = await service.respondToApproval(
    thread.sessionId ?? thread.id,
    requestId,
    decision,
  );
  if (response.status === "not_found") {
    return agentChatError("APPROVAL_NOT_FOUND", "Provider approval is no longer pending.");
  }

  const resolvedAt = nowIso(state);
  await state.dependencies.store.upsertActivity?.({
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
  await publish(
    state,
    threadId,
    "approval.resolved",
    {
      decision,
      requestId,
      response,
    },
    resolvedAt,
  );
  return agentChatOk({ requestId, response });
};

const threadSnapshot = async (
  store: AgentChatStoreShape,
  threadId: string,
): Promise<AgentChatSnapshot | undefined> => {
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

export const getThread = async (
  store: AgentChatStoreShape,
  threadId: string,
): Promise<AgentChatThreadRecord | undefined> => {
  const direct = await store.getThread?.(threadId);
  if (direct !== undefined) return direct;
  return (await store.listThreads()).find((thread) => thread.id === threadId);
};

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

export const threadForProtocol = (
  thread: AgentChatThreadRecord,
): Readonly<Record<string, unknown>> => ({
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

export const messageForProtocol = (
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

export const turnForProtocol = (turn: AgentChatTurnRecord): Readonly<Record<string, unknown>> => ({
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

export const activityForProtocol = (
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

export const questionForProtocol = (
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

const repositoriesFromThreadOrigin = async (
  state: RuntimeState,
  thread: AgentChatThreadRecord,
): Promise<readonly ChatRepositoryPayload[] | undefined> => {
  const repositoryId = threadOriginString(thread, "repositoryId");
  if (repositoryId === undefined) return undefined;

  const repositories = await state.dependencies.listRepositories?.();
  const repository = repositories?.find((entry) => entry.id === repositoryId);
  return [
    {
      id: repositoryId,
      ...(repository === undefined
        ? {}
        : { displayName: repository.displayName, path: repository.path }),
    },
  ];
};

export const chatOriginInstructions = (thread: AgentChatThreadRecord): string | undefined => {
  const repositoryId = threadOriginString(thread, "repositoryId");
  const issueId = threadOriginString(thread, "issueId");
  if (repositoryId === undefined || issueId === undefined) return undefined;

  if (threadOriginString(thread, "kind") === "ticket-agent-work") {
    return [
      "This chat thread was started for Cycle ticket implementation.",
      `Issue context: cycle://repository/${repositoryId}/tickets/${issueId}`,
      "Resolve that Cycle URI through the attached MCP tools before claiming repository or ticket context is missing.",
      assignedTicketImplementationWorkflowInstructions(),
    ].join("\n");
  }

  return issueMentionInstructions(thread);
};

const threadOriginString = (thread: AgentChatThreadRecord, key: string): string | undefined => {
  const value = thread.origin?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

export const providerProfileForChat = (
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
    defaultModel: profile.defaultModel ?? models[0] ?? null,
    defaultThinkingLevel: profile.defaultReasoningEffortId ?? null,
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
      profile.reasoningEfforts?.map((effort) => ({
        description: effort.description ?? null,
        disabled: effort.disabled === true,
        id: effort.id,
        label: effort.label,
      })) ?? [],
  };
};

const activityFromArtifact = (
  state: RuntimeState,
  artifact: AgentArtifact,
  input: Parameters<typeof runProviderTurn>[1],
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
          ? chatId(state, command === undefined ? "activity-tool" : "activity-command")
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
        artifactItemId === undefined
          ? chatId(state, "activity-tool")
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
      state,
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

const agentMentionPattern = /\bcycle-agent:([A-Za-z0-9][A-Za-z0-9._-]{0,127})\b/g;

export const parseAgentMentions = (body: string): readonly AgentProviderId[] => {
  const ids = new Set<AgentProviderId>();
  let match: RegExpExecArray | null;
  while ((match = agentMentionPattern.exec(body)) !== null) {
    const id = match[1];
    if (id !== undefined && isAgentProviderId(id)) ids.add(id);
  }
  return [...ids];
};

export const idFromResult = (value: unknown, fallback: string): string => {
  if (typeof value !== "object" || value === null) return fallback;
  const record = value as Readonly<Record<string, unknown>>;
  for (const key of ["id", "recordId", "commentId"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return fallback;
};

const handleSuccessfulCommentMentions = async (
  state: RuntimeState,
  input: Parameters<AgentChatRuntimeShape["handleSuccessfulCommentMentions"]>[0],
): Promise<void> => {
  const mentions = parseAgentMentions(input.body);
  if (mentions.length === 0) return;

  const profiles = await state.dependencies
    .agentProviderProfiles()
    .catch(() => [] as readonly AgentProviderProfile[]);

  for (const providerId of mentions) {
    const records = seedMentionThread({
      body: input.body,
      comment: input.comment,
      commentId: input.commentId,
      now: nowIso(state),
      profile: profiles.find((profile) => profile.provider === providerId),
      providerId,
      repositoryId: input.repositoryId,
      ticketId: input.ticketId,
    });
    await persistSeededThread(state.dependencies.store, records);
    forkProviderTask(state, records.turn.id, () =>
      runMentionTurn(state, {
        origin: input.origin,
        profile: records.profile,
        seedMessage: records.seedMessage,
        thread: records.thread,
        turn: records.turn,
      }),
    );
  }
};

type SeededMentionThread = {
  readonly profile?: AgentProviderProfile;
  readonly seedMessage: AgentChatMessageRecord;
  readonly thread: AgentChatThreadRecord;
  readonly turn: AgentChatTurnRecord;
};

const seedMentionThread = (input: {
  readonly body: string;
  readonly comment: unknown;
  readonly commentId: string;
  readonly now: string;
  readonly profile?: AgentProviderProfile;
  readonly providerId: AgentProviderId;
  readonly repositoryId: string;
  readonly ticketId: string;
}): SeededMentionThread => {
  const idSuffix = stableIdSuffix(
    input.repositoryId,
    input.ticketId,
    input.commentId,
    input.providerId,
  );
  const threadId = `issue-comment-${idSuffix}`;
  const turnId = `turn-issue-comment-${idSuffix}`;
  const messageId = `message-issue-comment-user-${idSuffix}`;
  const body = seedMessageBody(input.body, input.repositoryId, input.ticketId);
  const displayName = input.profile?.displayName ?? agentDisplayName(input.providerId);

  const seedMessage: AgentChatMessageRecord = {
    actor: "user",
    body,
    createdAt: input.now,
    id: messageId,
    metadata: {
      comment: safeJsonRecord(input.comment),
      commentId: input.commentId,
      issueComment: true,
      providerId: input.providerId,
    },
    threadId,
    turnId,
    updatedAt: input.now,
  };
  const thread: AgentChatThreadRecord = {
    activeTurnId: turnId,
    agentId: input.providerId,
    createdAt: input.now,
    id: threadId,
    lastError: null,
    model: input.profile?.defaultModel ?? null,
    origin: {
      agentId: input.providerId,
      commentId: input.commentId,
      issueId: input.ticketId,
      kind: "issue-comment",
      repositoryId: input.repositoryId,
      trigger: "agent-mention",
    },
    runtimeMode: "read-only",
    sessionId: threadId,
    status: "active",
    summary: input.body.trim().slice(0, 160) || `Agent mentioned on ticket ${input.ticketId}.`,
    title: `${displayName} review: ${input.ticketId}`,
    updatedAt: input.now,
  };
  const turn: AgentChatTurnRecord = {
    createdAt: input.now,
    id: turnId,
    inputMessageId: messageId,
    metadata: {
      commentId: input.commentId,
      issueComment: true,
      trigger: "agent-mention",
    },
    model: input.profile?.defaultModel ?? null,
    providerId: input.providerId,
    runtimeMode: "read-only",
    status: "queued",
    threadId,
    updatedAt: input.now,
  };

  return { profile: input.profile, seedMessage, thread, turn };
};

const persistSeededThread = async (
  chatStore: AgentChatStoreShape,
  records: SeededMentionThread,
): Promise<void> => {
  await chatStore.upsertThread(records.thread);
  await chatStore.upsertMessage(records.seedMessage);
  await chatStore.upsertTurn?.(records.turn);
  await chatStore.upsertActivity?.({
    createdAt: records.thread.createdAt,
    id: "activity-issue-comment-start",
    kind: "progress",
    payload: {
      commentId: records.thread.origin?.commentId,
      trigger: "agent-mention",
    },
    status: "running",
    threadId: records.thread.id,
    title: "Issue comment mention",
    turnId: records.turn.id,
    updatedAt: records.thread.createdAt,
  });
};

const runMentionTurn = async (
  state: RuntimeState,
  input: {
    readonly origin: string;
    readonly profile?: AgentProviderProfile;
    readonly seedMessage: AgentChatMessageRecord;
    readonly thread: AgentChatThreadRecord;
    readonly turn: AgentChatTurnRecord;
  },
): Promise<void> => {
  const providerId = input.turn.providerId as AgentProviderId;
  const sessionId = input.thread.sessionId ?? input.thread.id;
  const blocker = providerProfileBlocker(state, input.profile, providerId);
  if (blocker !== undefined) {
    await failMentionTurn(state, input, blocker);
    return;
  }

  const activeTurn = state.dependencies.activeTurns.begin({
    provider: providerId,
    requestId: input.turn.id,
    sessionId,
    threadId: input.thread.id,
  });
  if (!activeTurn.active) {
    await failMentionTurn(state, input, "A chat turn is already active for this thread.");
    return;
  }

  state.activeTurnsByThreadId.set(input.thread.id, activeTurn.record.abortController);

  try {
    await state.dependencies.store.upsertTurn?.({
      ...input.turn,
      status: "running",
      updatedAt: nowIso(state),
    });
    const service = await Effect.runPromise(
      state.dependencies.agentServices.serviceFor(providerId),
    );
    const mcp = await resolveMcp(state, {
      origin: input.origin,
      requestId: input.turn.id,
      required: true,
      threadId: input.thread.id,
    });
    const prepared = prepareChatTurn({
      mcp,
      payload: {
        instructions: issueMentionInstructions(input.thread),
        mcpRequired: true,
        message: input.seedMessage.body,
        model: input.turn.model ?? undefined,
        provider: providerId,
        repositories: [{ id: repositoryIdFromOrigin(input.thread) }],
        runtimeMode: "read-only",
        sessionId,
        threadId: input.thread.id,
      },
      requestId: input.turn.id,
    });
    const result = await service.run(prepared.sessionId, {
      ...prepared.agentRequest,
      signal: activeTurn.record.abortController.signal,
    });
    await completeMentionTurn(state, input, result);
  } catch (error) {
    await failMentionTurn(state, input, error instanceof Error ? error.message : String(error));
  } finally {
    state.activeTurnsByThreadId.delete(input.thread.id);
    state.dependencies.activeTurns.finish(providerId, sessionId);
  }
};

const completeMentionTurn = async (
  state: RuntimeState,
  input: Parameters<typeof runMentionTurn>[1],
  result: AgentTurnResult,
) => {
  const completedAt = (result.completedAt ?? state.dependencies.now()).toISOString();
  const status =
    result.status === "cancelled"
      ? "cancelled"
      : result.status === "failed"
        ? "failed"
        : "completed";
  const error = result.error?.message;
  const assistantMessage: AgentChatMessageRecord | undefined =
    result.text.trim().length === 0 && error === undefined
      ? undefined
      : {
          actor: "agent",
          body: bodyFromResult(result),
          createdAt: completedAt,
          id: result.id,
          streaming: false,
          threadId: input.thread.id,
          turnId: input.turn.id,
          updatedAt: completedAt,
        };
  if (assistantMessage !== undefined)
    await state.dependencies.store.upsertMessage(assistantMessage);

  await state.dependencies.store.upsertTurn?.({
    ...input.turn,
    ...(assistantMessage === undefined ? {} : { assistantMessageId: assistantMessage.id }),
    completedAt,
    lastError: error ?? null,
    status,
    updatedAt: completedAt,
  });
  await state.dependencies.store.upsertThread({
    ...input.thread,
    activeTurnId: null,
    lastError: error ?? null,
    status: status === "failed" ? "error" : "active",
    summary: error ?? assistantMessage?.body.slice(0, 160) ?? input.thread.summary,
    updatedAt: completedAt,
  });
  await state.dependencies.store.upsertActivity?.({
    createdAt: completedAt,
    detail: error ?? undefined,
    id: "activity-issue-comment-finished",
    kind: error === undefined ? "progress" : "error",
    payload: {
      resultId: result.id,
      status: result.status,
    },
    status: status === "completed" ? "completed" : status,
    threadId: input.thread.id,
    title: error === undefined ? "Issue comment mention completed" : "Issue comment mention failed",
    turnId: input.turn.id,
    updatedAt: completedAt,
  });
};

const failMentionTurn = async (
  state: RuntimeState,
  input: Parameters<typeof runMentionTurn>[1],
  message: string,
) => {
  const completedAt = nowIso(state);
  await state.dependencies.store.upsertTurn?.({
    ...input.turn,
    completedAt,
    lastError: message,
    status: "failed",
    updatedAt: completedAt,
  });
  await state.dependencies.store.upsertThread({
    ...input.thread,
    activeTurnId: null,
    lastError: message,
    status: "error",
    summary: message,
    updatedAt: completedAt,
  });
  await state.dependencies.store.upsertActivity?.({
    createdAt: completedAt,
    detail: message,
    id: "activity-issue-comment-failed",
    kind: "error",
    status: "failed",
    threadId: input.thread.id,
    title: "Issue comment mention failed",
    turnId: input.turn.id,
    updatedAt: completedAt,
  });
};

const issueMentionInstructions = (thread: AgentChatThreadRecord): string =>
  [
    "This chat thread was started from a Cycle issue mention.",
    `Issue context: cycle://repository/${repositoryIdFromOrigin(thread)}/tickets/${issueIdFromOrigin(thread)}`,
    "Resolve that Cycle URI through the attached MCP tools before claiming repository or ticket context is missing.",
  ].join("\n");

const seedMessageBody = (body: string, repositoryId: string, ticketId: string): string =>
  [body.trim(), "", `Ticket: cycle://repository/${repositoryId}/tickets/${ticketId}`].join("\n");

const repositoryIdFromOrigin = (thread: AgentChatThreadRecord): string => {
  const value = thread.origin?.repositoryId;
  return typeof value === "string" && value.length > 0 ? value : "unknown";
};

const issueIdFromOrigin = (thread: AgentChatThreadRecord): string => {
  const value = thread.origin?.issueId;
  return typeof value === "string" && value.length > 0 ? value : "unknown";
};

const safeJsonRecord = (value: unknown): Readonly<Record<string, unknown>> | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Readonly<Record<string, unknown>>;
};

const stableIdSuffix = (...parts: readonly string[]): string =>
  parts
    .map((part) => part.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, ""))
    .filter((part) => part.length > 0)
    .join("-");

const agentDisplayName = (agentId: string): string =>
  agentId.length === 0 ? "Agent" : `${agentId[0]?.toUpperCase() ?? ""}${agentId.slice(1)}`;
