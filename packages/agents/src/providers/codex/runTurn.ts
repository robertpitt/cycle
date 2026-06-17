import type { AgentTurnRequest, AgentTurnResult } from "../../types.ts";
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
import { artifactsFromTurn, normalizeUsage } from "./events.ts";
import { normalizeCodexError } from "./errors.ts";
import type { CodexTurnRuntime } from "./runtime.ts";
import type { StoredCodexSession } from "./types.ts";

export const runCodexTurn = async <TStructured = unknown>(
  runtime: CodexTurnRuntime,
  sessionId: string,
  request: AgentTurnRequest<TStructured>,
): Promise<AgentTurnResult<TStructured>> => {
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

  try {
    session = await runtime.saveSession(session, "running", {
      activeTurnId: turnId,
      ...(typeof request.context?.threadId === "string"
        ? { threadId: request.context.threadId }
        : {}),
      ...(cwd === undefined ? {} : { cwd }),
      ...(request.model?.id === undefined ? {} : { model: request.model.id }),
    });
    const turn = await thread.run(buildPrompt(request), buildTurnOptions(request, abort.signal));
    const completedAt = now();
    const nativeThreadId = thread.id ?? session.native?.threadId;
    const text = turn.finalResponse;
    const structured = parseStructured(request.responseFormat, text);
    session = await runtime.storeNativeThreadId(session, nativeThreadId, completedAt);

    return {
      artifacts: artifactsFromTurn(turn),
      completedAt,
      createdAt,
      finishReason: "stop",
      id: turnId,
      metadata: request.metadata,
      provider: codexProviderId,
      raw: turn,
      sessionId,
      status: "completed",
      ...(structured === undefined ? {} : { structured }),
      text,
      usage: normalizeUsage(turn.usage),
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

    return {
      artifacts: [],
      completedAt,
      createdAt,
      error: normalized,
      finishReason: normalized.code === "cancelled" ? "cancelled" : "error",
      id: turnId,
      metadata: request.metadata,
      provider: codexProviderId,
      raw: error,
      sessionId,
      status: normalized.code === "cancelled" ? "cancelled" : "failed",
      text: "",
    };
  } finally {
    abort.cleanup();
    const activeTurn = runtime.activeTurns.get(sessionId);
    if (activeTurn?.turnId === turnId) runtime.activeTurns.delete(sessionId);
  }
};
