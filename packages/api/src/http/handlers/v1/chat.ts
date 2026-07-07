import { Effect, Result, Stream } from "effect";
import { CycleApiError } from "@cycle/api";
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { CycleApiRuntime } from "../../runtime/CycleApiRuntime.ts";
import { CycleRequestContext } from "../../middleware/CycleRequestContextMiddleware.ts";
import { errorResponse, resourceResponse } from "../responses.ts";
import type { ChatTurnPayload } from "@cycle/agent-chat/domain";
import {
  messageFromTurnResult,
  requestOrigin,
  streamOptionsFromPayload,
} from "@cycle/agent-chat/prompt";
import { chatMessageFromPayload, chatThreadFromPayload } from "@cycle/agent-chat/payload-records";
import { prepareChatTurn } from "./chat/prepare.ts";
import { runStoreOperation } from "./chat/store.ts";
import { chatTurnSseFrames } from "./chat/stream.ts";

type ChatRequest = {
  readonly request: HttpServerRequest.HttpServerRequest;
};

type ChatThreadRequest = ChatRequest & {
  readonly params: {
    readonly threadId: string;
  };
  readonly payload: unknown;
};

type ChatThreadMessagesRequest = ChatRequest & {
  readonly params: {
    readonly threadId: string;
  };
};

type ChatThreadMessageRequest = ChatRequest & {
  readonly params: {
    readonly messageId: string;
    readonly threadId: string;
  };
  readonly payload: unknown;
};

type ChatTurnRequest = ChatRequest & {
  readonly payload: ChatTurnPayload;
};

export const listChatThreads = () =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const result = yield* runStoreOperation(requestId, "list agent chat threads", (store) =>
      store.listThreads(),
    );
    if (result.error !== undefined) return result.error;

    return resourceResponse(requestId, 200, {
      threads: result.value,
    });
  });

export const upsertChatThread = ({ params, payload }: ChatThreadRequest) =>
  Effect.gen(function* () {
    const runtime = yield* CycleApiRuntime;
    const { requestId } = yield* CycleRequestContext;
    const thread = chatThreadFromPayload({
      now: runtime.now().toISOString(),
      payload,
      threadId: params.threadId,
    });
    const result = yield* runStoreOperation(requestId, "save agent chat thread", (store) =>
      store.upsertThread(thread),
    );
    if (result.error !== undefined) return result.error;

    return resourceResponse(requestId, 200, {
      thread: result.value,
    });
  });

export const listChatThreadMessages = ({ params }: ChatThreadMessagesRequest) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const result = yield* runStoreOperation(requestId, "list agent chat messages", (store) =>
      store.listMessages(params.threadId),
    );
    if (result.error !== undefined) return result.error;

    return resourceResponse(requestId, 200, {
      messages: result.value,
    });
  });

export const upsertChatThreadMessage = ({ params, payload }: ChatThreadMessageRequest) =>
  Effect.gen(function* () {
    const runtime = yield* CycleApiRuntime;
    const { requestId } = yield* CycleRequestContext;
    const message = chatMessageFromPayload({
      messageId: params.messageId,
      now: runtime.now().toISOString(),
      payload,
      threadId: params.threadId,
    });
    const result = yield* runStoreOperation(requestId, "save agent chat message", (store) =>
      store.upsertMessage(message),
    );
    if (result.error !== undefined) return result.error;

    return resourceResponse(requestId, 200, {
      message: result.value,
    });
  });

export const createChatTurn = ({ payload, request }: ChatTurnRequest) =>
  Effect.gen(function* () {
    const runtime = yield* CycleApiRuntime;
    const { requestId } = yield* CycleRequestContext;
    const input = payload;
    const prepared = prepareChatTurn({
      origin: requestOrigin(request),
      payload: input,
      requestId,
      runtime,
    });
    const service = yield* runtime.agentServices.serviceFor(prepared.provider);
    const activeTurn = runtime.activeAgentTurns.begin({
      provider: prepared.provider,
      requestId,
      sessionId: prepared.sessionId,
      threadId: prepared.threadId,
    });
    if (!activeTurn.active) {
      return errorResponse(
        requestId,
        409,
        "AGENT_TURN_ACTIVE",
        "A chat turn is already active for this thread.",
        false,
      );
    }

    const turn = yield* Effect.result(
      Effect.tryPromise({
        try: () =>
          service.run(prepared.sessionId, {
            ...prepared.agentRequest,
            signal: activeTurn.record.abortController.signal,
          }),
        catch: (error) => {
          runtime.activeAgentTurns.finish(
            prepared.provider,
            prepared.sessionId,
            activeTurn.record.abortController.signal.aborted ? "cancelled" : "failed",
            error instanceof Error ? error.message : String(error),
          );
          return new CycleApiError({
            cause: error,
            message: error instanceof Error ? error.message : "run chat turn failed",
            operation: "run chat turn",
          });
        },
      }).pipe(
        Effect.tap((turnResult) =>
          Effect.sync(() => {
            runtime.activeAgentTurns.finish(
              prepared.provider,
              prepared.sessionId,
              turnResult.status,
              turnResult.error?.message,
            );
          }),
        ),
      ),
    );

    if (Result.isFailure(turn)) {
      return errorResponse(
        requestId,
        500,
        "AGENT_TURN_FAILED",
        turn.failure instanceof Error ? turn.failure.message : "Agent turn failed.",
        false,
      );
    }

    const result = turn.success;
    const message = messageFromTurnResult(result);

    return resourceResponse(requestId, 200, {
      message,
      provider: prepared.provider,
      result: {
        error: result.error,
        finishReason: result.finishReason,
        id: result.id,
        status: result.status,
      },
      sessionId: prepared.sessionId,
      threadId: prepared.threadId,
    });
  });

export const createChatTurnStream = ({ payload, request }: ChatTurnRequest) =>
  Effect.gen(function* () {
    const runtime = yield* CycleApiRuntime;
    const { requestId } = yield* CycleRequestContext;
    const input = payload;
    const prepared = prepareChatTurn({
      origin: requestOrigin(request),
      payload: input,
      requestId,
      runtime,
    });
    const service = yield* runtime.agentServices.serviceFor(prepared.provider);

    if (!service.capabilities().streaming) {
      return errorResponse(
        requestId,
        422,
        "AGENT_STREAMING_UNSUPPORTED",
        `Agent provider '${prepared.provider}' does not support streaming turns.`,
        false,
      );
    }

    const activeTurn = runtime.activeAgentTurns.begin({
      provider: prepared.provider,
      requestId,
      sessionId: prepared.sessionId,
      threadId: prepared.threadId,
    });
    if (!activeTurn.active) {
      return errorResponse(
        requestId,
        409,
        "AGENT_TURN_ACTIVE",
        "A chat turn is already active for this thread.",
        false,
      );
    }

    const frames = chatTurnSseFrames({
      activeTurn: activeTurn.record,
      agentRequest: prepared.agentRequest,
      provider: prepared.provider,
      requestId,
      runtime,
      service,
      sessionId: prepared.sessionId,
      stream: streamOptionsFromPayload(input),
      threadId: prepared.threadId,
    });

    return HttpServerResponse.stream(
      Stream.fromAsyncIterable(frames, (error) => error).pipe(Stream.encodeText),
      {
        contentType: "text/event-stream; charset=utf-8",
        headers: {
          "cache-control": "no-cache, no-transform",
          "x-accel-buffering": "no",
          "x-cycle-stream-version": "1",
          "x-request-id": requestId,
        },
        status: 200,
      },
    );
  });
