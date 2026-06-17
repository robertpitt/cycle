import type {
  AgentArtifact,
  AgentEvent,
  AgentTurnRequest,
  AgentTurnResult,
  AgentUsage,
} from "../../types.ts";
import {
  buildPrompt,
  buildThreadOptions,
  buildTurnOptions,
  cwdFromRequest,
  makeCodexClient,
  parseStructured,
  timeoutSignal,
} from "./client.ts";
import { codexProviderId, defaultCodexTimeoutMs, newCodexId, now } from "./constants.ts";
import { itemArtifact, normalizeUsage, progressMessageForItem } from "./events.ts";
import { normalizeCodexError } from "./errors.ts";
import type { CodexTurnRuntime } from "./runtime.ts";
import { makeCodexStreamState } from "./streamState.ts";
import type { StoredCodexSession } from "./types.ts";

export async function* streamCodexTurn<TStructured = unknown>(
  runtime: CodexTurnRuntime,
  sessionId: string,
  request: AgentTurnRequest<TStructured>,
): AsyncIterable<AgentEvent<TStructured>> {
  const createdAt = now();
  const turnId = newCodexId("turn");
  const cwd = cwdFromRequest(request, runtime.options.cwd);
  const threadOptions = buildThreadOptions(request, cwd, runtime.options);
  const codex = makeCodexClient(runtime.options, request);
  let session = (await runtime.resumeSession(sessionId)) as StoredCodexSession;
  const thread =
    session.native?.threadId === undefined
      ? codex.startThread(threadOptions)
      : codex.resumeThread(session.native.threadId, threadOptions);
  const abort = timeoutSignal(request.signal, runtime.options.timeoutMs ?? defaultCodexTimeoutMs);
  runtime.activeTurns.set(sessionId, { controller: abort.controller, turnId });
  const streamState = makeCodexStreamState();
  const artifactByItemId = new Map<string, AgentArtifact>();

  const completedResult = (
    completedAt: Date,
    usage: AgentUsage | undefined,
    raw: unknown,
  ): AgentTurnResult<TStructured> => {
    const text = streamState.finalText();
    const structured = parseStructured(request.responseFormat, text);

    return {
      artifacts: [...artifactByItemId.values()],
      completedAt,
      createdAt,
      finishReason: "stop",
      id: turnId,
      metadata: request.metadata,
      provider: codexProviderId,
      raw,
      sessionId,
      status: "completed",
      ...(structured === undefined ? {} : { structured }),
      text,
      usage,
    };
  };

  try {
    session = await runtime.saveSession(session, "running", {
      activeTurnId: turnId,
      ...(typeof request.context?.threadId === "string"
        ? { threadId: request.context.threadId }
        : {}),
      ...(cwd === undefined ? {} : { cwd }),
      ...(request.model?.id === undefined ? {} : { model: request.model.id }),
    });
    const streamed = await thread.runStreamed(
      buildPrompt(request),
      buildTurnOptions(request, abort.signal),
    );

    for await (const event of streamed.events) {
      switch (event.type) {
        case "thread.started":
          session = await runtime.storeNativeThreadId(session, event.thread_id, now(), "running", {
            activeTurnId: turnId,
          });
          break;

        case "turn.started":
          yield {
            at: now(),
            provider: codexProviderId,
            sessionId,
            turnId,
            type: "turn.started",
          };
          break;

        case "item.started":
        case "item.updated":
        case "item.completed": {
          streamState.recordItem(event.item);

          if (event.item.type === "agent_message") {
            const textDelta = streamState.textDeltaFromItem(event.item);
            if (textDelta !== undefined) {
              yield {
                at: now(),
                delta: textDelta.delta,
                sessionId,
                snapshot: textDelta.snapshot,
                turnId,
                type: "text.delta",
              };
            }
            break;
          }

          const artifact = itemArtifact(event.item);
          if (artifact !== undefined) {
            artifactByItemId.set(event.item.id, artifact);
            yield {
              artifact,
              at: now(),
              sessionId,
              turnId,
              type: "artifact",
            };
          }

          const message = progressMessageForItem(event.item);
          if (message !== undefined) {
            yield {
              at: now(),
              message,
              raw: {
                itemId: event.item.id,
                itemType: event.item.type,
                phase: event.type,
                status: "status" in event.item ? event.item.status : undefined,
              },
              sessionId,
              turnId,
              type: "progress",
            };
          }
          break;
        }

        case "turn.completed": {
          const completedAt = now();
          const usage = normalizeUsage(event.usage);
          if (usage !== undefined) {
            yield {
              at: completedAt,
              sessionId,
              turnId,
              type: "usage",
              usage,
            };
          }

          session = await runtime.storeNativeThreadId(
            session,
            thread.id ?? session.native?.threadId,
            completedAt,
          );
          const result = completedResult(completedAt, usage, {
            finalResponse: streamState.finalText(),
            items: streamState.orderedItems(),
            usage: event.usage,
          });

          yield {
            at: completedAt,
            result,
            sessionId,
            turnId,
            type: "turn.completed",
          };
          return;
        }

        case "turn.failed": {
          const completedAt = now();
          const error = normalizeCodexError(event.error);
          session = await runtime.storeNativeThreadId(
            session,
            thread.id ?? session.native?.threadId,
            completedAt,
            error.code === "cancelled" ? "idle" : "error",
            { lastError: error.message },
          );

          if (error.code === "cancelled") {
            yield {
              at: completedAt,
              error,
              sessionId,
              turnId,
              type: "turn.cancelled",
            };
            return;
          }

          yield {
            at: completedAt,
            error,
            sessionId,
            turnId,
            type: "turn.failed",
          };
          return;
        }

        case "error": {
          const completedAt = now();
          const error = normalizeCodexError(new Error(event.message));
          session = await runtime.storeNativeThreadId(
            session,
            thread.id ?? session.native?.threadId,
            completedAt,
            error.code === "cancelled" ? "idle" : "error",
            { lastError: error.message },
          );

          if (error.code === "cancelled") {
            yield {
              at: completedAt,
              error,
              sessionId,
              turnId,
              type: "turn.cancelled",
            };
            return;
          }

          yield {
            at: completedAt,
            error,
            sessionId,
            turnId,
            type: "turn.failed",
          };
          return;
        }
      }
    }

    const completedAt = now();
    const result = completedResult(completedAt, undefined, {
      finalResponse: streamState.finalText(),
      items: streamState.orderedItems(),
      usage: null,
    });
    session = await runtime.storeNativeThreadId(
      session,
      thread.id ?? session.native?.threadId,
      completedAt,
    );

    yield {
      at: completedAt,
      result,
      sessionId,
      turnId,
      type: "turn.completed",
    };
  } catch (error) {
    const completedAt = now();
    const normalized = normalizeCodexError(error);
    session = await runtime.storeNativeThreadId(
      session,
      thread.id ?? session.native?.threadId,
      completedAt,
      normalized.code === "cancelled" ? "idle" : "error",
      { lastError: normalized.message },
    );

    if (normalized.code === "cancelled") {
      yield {
        at: completedAt,
        error: normalized,
        sessionId,
        turnId,
        type: "turn.cancelled",
      };
      return;
    }

    yield {
      at: completedAt,
      error: normalized,
      sessionId,
      turnId,
      type: "turn.failed",
    };
  } finally {
    abort.cleanup();
    const activeTurn = runtime.activeTurns.get(sessionId);
    if (activeTurn?.turnId === turnId) runtime.activeTurns.delete(sessionId);
  }
}
