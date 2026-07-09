import { AgentChatCreateInput, AgentChatSendInput, type AgentChatShape } from "@cycle/agent-chat";
import { Effect, Option, Result, Stream } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import {
  chatMessageRecord,
  chatThreadRecord,
} from "../../../agents/services/AgentChatTransport.ts";
import { CycleApiRuntime } from "../../runtime/CycleApiRuntime.ts";
import { CycleRequestContext } from "../../middleware/CycleRequestContextMiddleware.ts";
import { errorResponse, resourceResponse } from "../responses.ts";
import type { ChatTurnPayload as ChatTurnPayloadSchema } from "../../schemas/ChatTurnPayload.ts";

type ChatTurnPayload = typeof ChatTurnPayloadSchema.Type;

type ChatRequest = {
  readonly request: {
    readonly headers: Readonly<Record<string, string | undefined>>;
    readonly url: string;
  };
};
type ChatThreadRequest = ChatRequest & {
  readonly params: { readonly threadId: string };
  readonly payload: unknown;
};
type ChatThreadMessagesRequest = { readonly params: { readonly threadId: string } };
type ChatThreadMessageRequest = ChatRequest & {
  readonly params: { readonly messageId: string; readonly threadId: string };
  readonly payload: unknown;
};
type ChatTurnRequest = ChatRequest & { readonly payload: ChatTurnPayload };

const record = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};

const unavailable = (requestId: string) =>
  errorResponse(
    requestId,
    503,
    "AGENT_CHAT_UNAVAILABLE",
    "The durable agent chat runtime is unavailable in this host.",
    true,
  );

const failure = (requestId: string, action: string, cause: unknown) =>
  errorResponse(
    requestId,
    500,
    "AGENT_CHAT_FAILED",
    cause instanceof Error ? cause.message : `Could not ${action}.`,
    typeof cause === "object" && cause !== null && "retryable" in cause && cause.retryable === true,
  );

const getOrCreateThread = (
  chat: AgentChatShape,
  input: ChatTurnPayload,
  requestedThreadId: string,
) =>
  chat.get(requestedThreadId).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () =>
          chat.create(
            new AgentChatCreateInput({
              idempotencyKey: `http-thread-${requestedThreadId}`,
              ...(input.model === undefined ? {} : { model: input.model }),
              providerId: input.provider ?? "codex",
              ...(input.repositories?.[0]?.id === undefined
                ? {}
                : { repositoryId: input.repositories[0].id }),
              title: "Agent conversation",
            }),
          ),
        onSome: Effect.succeed,
      }),
    ),
  );

export const listChatThreads = () =>
  Effect.gen(function* () {
    const runtime = yield* CycleApiRuntime;
    const { requestId } = yield* CycleRequestContext;
    if (runtime.agentChat === undefined) return unavailable(requestId);
    const result = yield* Effect.result(
      runtime.agentChat
        .list({ includeArchived: true })
        .pipe(Stream.map(chatThreadRecord), Stream.runCollect),
    );
    return Result.match(result, {
      onFailure: (cause) => failure(requestId, "list chat threads", cause),
      onSuccess: (threads) => resourceResponse(requestId, 200, { threads }),
    });
  });

export const upsertChatThread = ({ params, payload }: ChatThreadRequest) =>
  Effect.gen(function* () {
    const runtime = yield* CycleApiRuntime;
    const { requestId } = yield* CycleRequestContext;
    if (runtime.agentChat === undefined) return unavailable(requestId);
    const value = record(payload);
    const existing = yield* runtime.agentChat.get(params.threadId).pipe(Effect.result);
    const result = yield* Result.match(existing, {
      onFailure: Effect.fail,
      onSuccess: Option.match({
        onNone: () =>
          runtime.agentChat!.create(
            new AgentChatCreateInput({
              agentId: typeof value.agentId === "string" ? value.agentId : undefined,
              idempotencyKey: `http-thread-${params.threadId}`,
              providerId: typeof value.agentId === "string" ? value.agentId : "codex",
              title: typeof value.title === "string" ? value.title : "New chat",
            }),
          ),
        onSome: Effect.succeed,
      }),
    }).pipe(Effect.result);
    return Result.match(result, {
      onFailure: (cause) => failure(requestId, "save chat thread", cause),
      onSuccess: (view) =>
        resourceResponse(requestId, 200, { thread: chatThreadRecord(view.thread) }),
    });
  });

export const listChatThreadMessages = ({ params }: ChatThreadMessagesRequest) =>
  Effect.gen(function* () {
    const runtime = yield* CycleApiRuntime;
    const { requestId } = yield* CycleRequestContext;
    if (runtime.agentChat === undefined) return unavailable(requestId);
    const result = yield* runtime.agentChat.get(params.threadId).pipe(Effect.result);
    return Result.match(result, {
      onFailure: (cause) => failure(requestId, "list chat messages", cause),
      onSuccess: Option.match({
        onNone: () => errorResponse(requestId, 404, "NOT_FOUND", "Chat thread not found."),
        onSome: (view) =>
          resourceResponse(requestId, 200, {
            messages: view.messages.map((message) => chatMessageRecord(params.threadId, message)),
          }),
      }),
    });
  });

export const upsertChatThreadMessage = ({ params, payload }: ChatThreadMessageRequest) =>
  Effect.gen(function* () {
    const runtime = yield* CycleApiRuntime;
    const { requestId } = yield* CycleRequestContext;
    if (runtime.agentChat === undefined) return unavailable(requestId);
    const value = record(payload);
    const body = typeof value.body === "string" ? value.body : "";
    if (value.actor !== undefined && value.actor !== "user") {
      return errorResponse(
        requestId,
        422,
        "AGENT_CHAT_UNSUPPORTED",
        "Assistant messages are written by the durable agent runtime, not by clients.",
      );
    }
    const result = yield* runtime.agentChat
      .send(
        new AgentChatSendInput({
          idempotencyKey: `http-message-${params.messageId}`,
          message: body,
          threadId: params.threadId,
        }),
      )
      .pipe(Effect.result);
    return Result.match(result, {
      onFailure: (cause) => failure(requestId, "send chat message", cause),
      onSuccess: (view) => {
        const message =
          view.messages.find((candidate) => candidate.content === body) ?? view.messages.at(-1);
        return resourceResponse(requestId, 200, {
          message: message === undefined ? undefined : chatMessageRecord(params.threadId, message),
        });
      },
    });
  });

export const createChatTurn = ({ payload }: ChatTurnRequest) =>
  Effect.gen(function* () {
    const runtime = yield* CycleApiRuntime;
    const { requestId } = yield* CycleRequestContext;
    if (runtime.agentChat === undefined) return unavailable(requestId);
    const requestedThreadId = payload.threadId ?? payload.sessionId ?? `chat_${requestId}`;
    const result = yield* getOrCreateThread(runtime.agentChat, payload, requestedThreadId).pipe(
      Effect.flatMap((view) =>
        runtime.agentChat!.send(
          new AgentChatSendInput({
            idempotencyKey: `http-turn-${requestId}`,
            message: payload.message,
            threadId: view.thread.threadId,
          }),
        ),
      ),
      Effect.result,
    );
    return Result.match(result, {
      onFailure: (cause) => failure(requestId, "start chat turn", cause),
      onSuccess: (view) => {
        const message = view.messages.at(-1);
        return resourceResponse(requestId, 202, {
          message:
            message === undefined
              ? undefined
              : {
                  content: message.content,
                  createdAt: message.createdAt,
                  id: message.messageId,
                  role: message.role,
                },
          provider: view.thread.providerId,
          result: { id: view.thread.activeTaskId, status: "queued" },
          sessionId: view.thread.threadId,
          threadId: view.thread.threadId,
        });
      },
    });
  });

export const createChatTurnStream = ({ payload }: ChatTurnRequest) =>
  Effect.gen(function* () {
    const runtime = yield* CycleApiRuntime;
    const { requestId } = yield* CycleRequestContext;
    if (runtime.agentChat === undefined) return unavailable(requestId);
    const requestedThreadId = payload.threadId ?? payload.sessionId ?? `chat_${requestId}`;
    const before = yield* getOrCreateThread(runtime.agentChat, payload, requestedThreadId).pipe(
      Effect.result,
    );
    if (Result.isFailure(before)) return failure(requestId, "load chat thread", before.failure);
    const sent = yield* runtime.agentChat
      .send(
        new AgentChatSendInput({
          idempotencyKey: `http-stream-${requestId}`,
          message: payload.message,
          threadId: before.success.thread.threadId,
        }),
      )
      .pipe(Effect.result);
    if (Result.isFailure(sent)) return failure(requestId, "start chat stream", sent.failure);
    const taskId = sent.success.thread.activeTaskId;
    const frames = runtime.agentChat
      .observe({
        afterSequence: before.success.lastSequence,
        tail: true,
        threadId: sent.success.thread.threadId,
      })
      .pipe(
        Stream.takeUntil(
          (event) =>
            event.taskId === taskId &&
            (event.type === "task.completed" ||
              event.type === "task.failed" ||
              event.type === "task.cancelled"),
        ),
        Stream.map(
          (event) =>
            `event: ${event.type}\ndata: ${JSON.stringify({
              eventId: event.eventId,
              payload: event.payload,
              requestId,
              sequence: event.sequence,
              taskId: event.taskId,
              threadId: event.threadId,
              type: event.type,
              version: 1,
            })}\n\n`,
        ),
      );
    return HttpServerResponse.stream(frames.pipe(Stream.encodeText), {
      contentType: "text/event-stream; charset=utf-8",
      headers: {
        "cache-control": "no-cache, no-transform",
        "x-accel-buffering": "no",
        "x-cycle-stream-version": "1",
        "x-request-id": requestId,
      },
      status: 200,
    });
  });
