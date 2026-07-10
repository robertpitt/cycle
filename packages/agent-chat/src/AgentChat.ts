import {
  AgentControlInput,
  AgentRuntimeService,
  AgentThreadSendInput,
} from "@cycle/agents/runtime";
import {
  AgentInteractionResponseInput,
  AgentThreadCreateInput,
  type AgentInteractionId,
  type AgentTaskId,
  type AgentThreadId,
} from "@cycle/agents/models";
import type { AgentRuntimeEvent } from "@cycle/agents/events";
import { Context, DateTime, Effect, Layer, Option, Schema, Stream } from "effect";
import { AgentChatError } from "./AgentChatErrors.ts";
import { AgentChatEvent } from "./AgentChatEvents.ts";
import { AgentChatInteraction } from "./AgentChatInteraction.ts";
import { AgentChatMessage } from "./AgentChatMessage.ts";
import { AgentChatThread } from "./AgentChatThread.ts";

export class AgentChatCreateInput extends Schema.Class<AgentChatCreateInput>(
  "@cycle/agent-chat/AgentChatCreateInput",
)({
  agentId: Schema.optional(Schema.String),
  harnessId: Schema.optional(Schema.String),
  idempotencyKey: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  origin: Schema.optional(Schema.Record(Schema.String, Schema.Json)),
  providerId: Schema.optional(Schema.String),
  repositoryId: Schema.optional(Schema.String),
  runtimeMode: Schema.optional(Schema.Literals(["read-only", "workspace-write", "full-access"])),
  title: Schema.optional(Schema.String),
}) {}

export class AgentChatSendInput extends Schema.Class<AgentChatSendInput>(
  "@cycle/agent-chat/AgentChatSendInput",
)({
  idempotencyKey: Schema.optional(Schema.String),
  message: Schema.String,
  threadId: Schema.String,
}) {}

export class AgentChatView extends Schema.Class<AgentChatView>("@cycle/agent-chat/AgentChatView")({
  interactions: Schema.Array(AgentChatInteraction),
  lastSequence: Schema.Int,
  messages: Schema.Array(AgentChatMessage),
  thread: AgentChatThread,
}) {}

export type AgentChatShape = {
  readonly archive: (threadId: string) => Effect.Effect<AgentChatView, AgentChatError>;
  readonly create: (input: AgentChatCreateInput) => Effect.Effect<AgentChatView, AgentChatError>;
  readonly get: (threadId: string) => Effect.Effect<Option.Option<AgentChatView>, AgentChatError>;
  readonly interrupt: (input: {
    readonly commandId?: string;
    readonly reason?: string;
    readonly taskId: string;
    readonly threadId: string;
  }) => Effect.Effect<void, AgentChatError>;
  readonly list: (input?: {
    readonly includeArchived?: boolean;
    readonly repositoryId?: string;
  }) => Stream.Stream<AgentChatThread, AgentChatError>;
  readonly observe: (input: {
    readonly afterSequence?: number;
    readonly tail?: boolean;
    readonly threadId: string;
  }) => Stream.Stream<AgentChatEvent, AgentChatError>;
  readonly respond: (input: {
    readonly commandId: string;
    readonly interactionId: string;
    readonly responderId: string;
    readonly response: Schema.Json;
    readonly taskId: string;
    readonly threadId: string;
  }) => Effect.Effect<void, AgentChatError>;
  readonly send: (input: AgentChatSendInput) => Effect.Effect<AgentChatView, AgentChatError>;
  readonly steer: (input: {
    readonly commandId?: string;
    readonly message: string;
    readonly taskId: string;
    readonly threadId: string;
  }) => Effect.Effect<void, AgentChatError>;
};

export class AgentChat extends Context.Service<AgentChat, AgentChatShape>()(
  "@cycle/agent-chat/AgentChat",
) {}

const mapError = (cause: unknown): AgentChatError =>
  new AgentChatError({
    code:
      typeof cause === "object" && cause !== null && "code" in cause
        ? String(cause.code)
        : "agent_chat_error",
    message:
      cause instanceof Error
        ? cause.message
        : typeof cause === "object" && cause !== null && "message" in cause
          ? String(cause.message)
          : "Agent chat operation failed.",
    retryable:
      typeof cause === "object" &&
      cause !== null &&
      "retryable" in cause &&
      cause.retryable === true,
  });

const threadProjection = (snapshot: {
  readonly thread: {
    readonly activeTaskId?: string;
    readonly agentId: string;
    readonly createdAt: DateTime.Utc;
    readonly harnessId: string;
    readonly authority: { readonly mode: string };
    readonly kind: string;
    readonly metadata: Readonly<Record<string, Schema.Json>>;
    readonly model?: string;
    readonly providerId: string;
    readonly repositoryId?: string;
    readonly status: "open" | "archived";
    readonly threadId: string;
    readonly ticketId?: string;
    readonly title?: string;
    readonly updatedAt: DateTime.Utc;
  };
}) =>
  new AgentChatThread({
    agentId: snapshot.thread.agentId,
    createdAt: DateTime.formatIso(snapshot.thread.createdAt),
    harnessId: snapshot.thread.harnessId,
    kind: snapshot.thread.kind,
    metadata: snapshot.thread.metadata,
    providerId: snapshot.thread.providerId,
    runtimeMode:
      snapshot.thread.authority.mode === "implementation-worktree" ||
      snapshot.thread.authority.mode === "operator-full-access"
        ? "full-access"
        : snapshot.thread.authority.mode === "disposable-worktree"
          ? "workspace-write"
          : "read-only",
    status:
      snapshot.thread.status === "archived"
        ? "archived"
        : snapshot.thread.activeTaskId === undefined
          ? "open"
          : "busy",
    threadId: snapshot.thread.threadId,
    updatedAt: DateTime.formatIso(snapshot.thread.updatedAt),
    ...(snapshot.thread.activeTaskId === undefined
      ? {}
      : { activeTaskId: snapshot.thread.activeTaskId }),
    ...(snapshot.thread.model === undefined ? {} : { model: snapshot.thread.model }),
    ...(snapshot.thread.repositoryId === undefined
      ? {}
      : { repositoryId: snapshot.thread.repositoryId }),
    ...(snapshot.thread.title === undefined ? {} : { title: snapshot.thread.title }),
    ...(snapshot.thread.ticketId === undefined ? {} : { ticketId: snapshot.thread.ticketId }),
  });

const messageProjection = (message: {
  readonly createdAt: DateTime.Utc;
  readonly messageId: string;
  readonly parts: ReadonlyArray<{ readonly _tag: string; readonly text?: string }>;
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly status: "streaming" | "completed" | "failed";
  readonly taskId?: string;
  readonly updatedAt: DateTime.Utc;
}) =>
  new AgentChatMessage({
    content: message.parts
      .filter((part) => part._tag === "text" || part._tag === "reasoning-summary")
      .map((part) => part.text ?? "")
      .join(""),
    createdAt: DateTime.formatIso(message.createdAt),
    messageId: message.messageId,
    role: message.role,
    status: message.status,
    updatedAt: DateTime.formatIso(message.updatedAt),
    ...(message.taskId === undefined ? {} : { taskId: message.taskId }),
  });

const snapshotProjection = (snapshot: {
  readonly interactions: ReadonlyArray<{
    readonly fields: Readonly<Record<string, Schema.Json>>;
    readonly interactionId: string;
    readonly prompt: string;
    readonly status: "open" | "answered" | "cancelled" | "expired" | "rejected";
    readonly taskId: string;
    readonly type: "approval" | "user-input";
  }>;
  readonly lastSequence: number;
  readonly messages: ReadonlyArray<Parameters<typeof messageProjection>[0]>;
  readonly thread: Parameters<typeof threadProjection>[0]["thread"];
}) =>
  new AgentChatView({
    interactions: snapshot.interactions.map(
      (interaction) => new AgentChatInteraction({ ...interaction }),
    ),
    lastSequence: snapshot.lastSequence,
    messages: snapshot.messages.map(messageProjection),
    thread: threadProjection(snapshot),
  });

const eventProjection = (event: AgentRuntimeEvent) =>
  new AgentChatEvent({
    createdAt: DateTime.formatIso(event.occurredAt),
    eventId: event.eventId,
    payload: event.payload,
    sequence: event.sequence,
    threadId: event.threadId,
    type: event.eventType,
    ...(event.taskId === undefined ? {} : { taskId: event.taskId }),
  });

export const AgentChatLive = Layer.effect(
  AgentChat,
  Effect.gen(function* () {
    const runtime = yield* AgentRuntimeService;
    const snapshot = (threadId: string) =>
      runtime
        .getThread(threadId as AgentThreadId)
        .pipe(Effect.map(Option.map(snapshotProjection)), Effect.mapError(mapError));

    return AgentChat.of({
      archive: (threadId) =>
        runtime
          .archiveThread(threadId as AgentThreadId)
          .pipe(Effect.map(snapshotProjection), Effect.mapError(mapError)),
      create: (input) =>
        runtime
          .createThread(
            new AgentThreadCreateInput({
              agentId: input.agentId ?? "default",
              authority:
                input.runtimeMode === "full-access"
                  ? {
                      allowedOperations: ["repository.read", "workspace.write", "command.execute"],
                      mode: "operator-full-access",
                      ...(input.repositoryId === undefined
                        ? {}
                        : { repositoryId: input.repositoryId }),
                    }
                  : {
                      allowedOperations: [],
                      mode:
                        input.repositoryId === undefined ? "conversation-read" : "repository-read",
                      ...(input.repositoryId === undefined
                        ? {}
                        : { repositoryId: input.repositoryId }),
                    },
              harnessId: input.harnessId ?? input.providerId ?? "codex",
              kind: "interactive",
              metadata: input.origin === undefined ? {} : { origin: input.origin },
              providerId: input.providerId ?? "codex",
              ...(input.idempotencyKey === undefined
                ? {}
                : { idempotencyKey: input.idempotencyKey }),
              ...(input.model === undefined ? {} : { model: input.model }),
              ...(input.repositoryId === undefined ? {} : { repositoryId: input.repositoryId }),
              ...(input.title === undefined ? {} : { title: input.title }),
            }),
          )
          .pipe(Effect.map(snapshotProjection), Effect.mapError(mapError)),
      get: snapshot,
      interrupt: (input) =>
        runtime
          .interrupt(
            new AgentControlInput({
              taskId: input.taskId as AgentTaskId,
              threadId: input.threadId as AgentThreadId,
              ...(input.commandId === undefined ? {} : { commandId: input.commandId as never }),
              ...(input.reason === undefined ? {} : { reason: input.reason }),
            }),
          )
          .pipe(Effect.asVoid, Effect.mapError(mapError)),
      list: (input = {}) =>
        runtime
          .listThreads({
            includeArchived: input.includeArchived,
            repositoryId: input.repositoryId,
          })
          .pipe(
            Stream.map((thread) => threadProjection({ thread })),
            Stream.mapError(mapError),
          ),
      observe: (input) =>
        runtime
          .observe({
            afterSequence: input.afterSequence,
            tail: input.tail,
            threadId: input.threadId,
            visibility: ["public"],
          })
          .pipe(Stream.map(eventProjection), Stream.mapError(mapError)),
      respond: (input) =>
        runtime
          .respond({
            interactionId: input.interactionId as AgentInteractionId,
            response: new AgentInteractionResponseInput({
              commandId: input.commandId,
              interactionId: input.interactionId as AgentInteractionId,
              responderId: input.responderId,
              response: input.response,
            }),
            taskId: input.taskId as AgentTaskId,
            threadId: input.threadId as AgentThreadId,
          })
          .pipe(Effect.asVoid, Effect.mapError(mapError)),
      send: (input) =>
        runtime
          .send(
            new AgentThreadSendInput({
              message: input.message,
              threadId: input.threadId as AgentThreadId,
              ...(input.idempotencyKey === undefined
                ? {}
                : { idempotencyKey: input.idempotencyKey }),
            }),
          )
          .pipe(
            Effect.mapError(mapError),
            Effect.flatMap(() => snapshot(input.threadId)),
            Effect.flatMap(
              Option.match({
                onNone: () => Effect.fail(mapError(new Error("Thread disappeared after send."))),
                onSome: Effect.succeed,
              }),
            ),
          ),
      steer: (input) =>
        runtime
          .steer(
            new AgentControlInput({
              message: input.message,
              taskId: input.taskId as AgentTaskId,
              threadId: input.threadId as AgentThreadId,
              ...(input.commandId === undefined ? {} : { commandId: input.commandId as never }),
            }),
          )
          .pipe(Effect.asVoid, Effect.mapError(mapError)),
    });
  }),
);
