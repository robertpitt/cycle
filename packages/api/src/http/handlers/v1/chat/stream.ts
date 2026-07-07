import type {
  AgentError,
  AgentEvent,
  AgentProviderId,
  AgentService,
  AgentTurnRuntimeRecord,
  AgentTurnRequest,
  AgentTurnResult,
} from "@cycle/agents";
import type { CycleApiRuntimeShape } from "../../../runtime/CycleApiRuntime.ts";
import type { ChatStreamEnvelope, ChatStreamOptions } from "@cycle/agent-chat/domain";
import { messageFromTurnResult } from "@cycle/agent-chat/prompt";

const publicAgentError = (error: AgentError): Omit<AgentError, "raw"> => {
  const { raw: _raw, ...publicError } = error;
  return publicError;
};

const publicTurnResult = (result: AgentTurnResult): Readonly<Record<string, unknown>> => {
  const { completedAt, createdAt, error, raw: _raw, ...rest } = result;

  return {
    ...rest,
    createdAt: createdAt.toISOString(),
    ...(completedAt === undefined ? {} : { completedAt: completedAt.toISOString() }),
    ...(error === undefined ? {} : { error: publicAgentError(error) }),
  };
};

const envelopeForAgentEvent = (input: {
  readonly event: AgentEvent;
  readonly provider: AgentProviderId;
  readonly requestId: string;
  readonly sequence: number;
  readonly threadId: string;
}): ChatStreamEnvelope => {
  const base = {
    at: input.event.at.toISOString(),
    provider: "provider" in input.event ? input.event.provider : input.provider,
    requestId: input.requestId,
    sequence: input.sequence,
    sessionId: input.event.sessionId,
    threadId: input.threadId,
    turnId: input.event.turnId,
    type: input.event.type,
  };

  switch (input.event.type) {
    case "turn.started":
      return base;

    case "text.delta":
      return {
        ...base,
        data: {
          delta: input.event.delta,
          ...(input.event.snapshot === undefined ? {} : { snapshot: input.event.snapshot }),
        },
      };

    case "content.delta":
      return {
        ...base,
        data: {
          delta: input.event.delta,
          ...(input.event.itemId === undefined ? {} : { itemId: input.event.itemId }),
          ...(input.event.snapshot === undefined ? {} : { snapshot: input.event.snapshot }),
          streamKind: input.event.streamKind,
        },
      };

    case "turn.plan.updated":
      return {
        ...base,
        data: {
          ...(input.event.explanation === undefined
            ? {}
            : { explanation: input.event.explanation }),
          plan: input.event.plan,
        },
      };

    case "turn.diff.updated":
      return {
        ...base,
        data: {
          diff: input.event.diff,
        },
      };

    case "item.started":
    case "item.updated":
    case "item.completed":
      return {
        ...base,
        data: {
          item: input.event.item,
          itemId: input.event.itemId,
          ...(input.event.itemType === undefined ? {} : { itemType: input.event.itemType }),
        },
      };

    case "approval.requested":
      return {
        ...base,
        data: {
          request: input.event.request,
        },
      };

    case "approval.resolved":
      return {
        ...base,
        data: {
          decision: input.event.decision,
          requestId: input.event.requestId,
        },
      };

    case "user-input.requested":
      return {
        ...base,
        data: {
          request: input.event.request,
        },
      };

    case "user-input.resolved":
      return {
        ...base,
        data: {
          answers: input.event.answers,
          requestId: input.event.requestId,
        },
      };

    case "runtime.warning":
      return {
        ...base,
        data: {
          message: input.event.message,
          ...(input.event.raw === undefined ? {} : { raw: input.event.raw }),
        },
      };

    case "runtime.error":
      return {
        ...base,
        data: {
          error: publicAgentError(input.event.error),
        },
      };

    case "progress":
      return {
        ...base,
        data: {
          message: input.event.message,
          ...(input.event.raw === undefined ? {} : { raw: input.event.raw }),
        },
      };

    case "artifact":
      return {
        ...base,
        data: {
          artifact: input.event.artifact,
        },
      };

    case "usage":
      return {
        ...base,
        data: {
          usage: input.event.usage,
        },
      };

    case "turn.completed":
      return {
        ...base,
        data: {
          message: messageFromTurnResult(input.event.result),
          result: publicTurnResult(input.event.result),
        },
      };

    case "turn.failed":
      return {
        ...base,
        data: {
          error: publicAgentError(input.event.error),
          status: "failed",
        },
      };

    case "turn.cancelled":
      return {
        ...base,
        data: {
          error: publicAgentError(input.event.error),
          status: "cancelled",
        },
      };
  }
};

const heartbeatEnvelope = (input: {
  readonly requestId: string;
  readonly sequence: number;
}): ChatStreamEnvelope => ({
  at: new Date().toISOString(),
  requestId: input.requestId,
  sequence: input.sequence,
  type: "heartbeat",
});

const sseFrame = (envelope: ChatStreamEnvelope): string =>
  `id: ${envelope.requestId}:${envelope.sequence}\nevent: ${envelope.type}\ndata: ${JSON.stringify(
    envelope,
  )}\n\n`;

const heartbeatTimer = (
  heartbeatMs: number,
): {
  readonly cancel: () => void;
  readonly promise: Promise<"heartbeat">;
} => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<"heartbeat">((resolve) => {
    timeout = setTimeout(() => resolve("heartbeat"), heartbeatMs);
  });

  return {
    cancel: () => {
      if (timeout !== undefined) clearTimeout(timeout);
    },
    promise,
  };
};

const terminalEventTypes = new Set(["turn.completed", "turn.failed", "turn.cancelled"]);

const terminalStatusForEvent = (
  event: AgentEvent,
): AgentTurnRuntimeRecord["status"] | undefined => {
  switch (event.type) {
    case "turn.completed":
      return "completed";
    case "turn.failed":
      return "failed";
    case "turn.cancelled":
      return "cancelled";
    default:
      return undefined;
  }
};

export async function* chatTurnSseFrames(input: {
  readonly activeTurn: AgentTurnRuntimeRecord;
  readonly agentRequest: AgentTurnRequest;
  readonly provider: AgentProviderId;
  readonly requestId: string;
  readonly runtime: CycleApiRuntimeShape;
  readonly service: AgentService;
  readonly sessionId: string;
  readonly stream: ChatStreamOptions;
  readonly threadId: string;
}): AsyncIterable<string> {
  const iterator = input.service
    .stream(input.sessionId, {
      ...input.agentRequest,
      signal: input.activeTurn.abortController.signal,
    })
    [Symbol.asyncIterator]();
  let sequence = 0;
  let terminal = false;
  let terminalStatus: AgentTurnRuntimeRecord["status"] | undefined;
  let pending = iterator.next();

  const nextSequence = (): number => {
    sequence += 1;
    return sequence;
  };

  try {
    while (true) {
      const heartbeat = heartbeatTimer(input.stream.heartbeatMs);
      const next = await Promise.race([pending, heartbeat.promise]);
      heartbeat.cancel();

      if (next === "heartbeat") {
        yield sseFrame(
          heartbeatEnvelope({
            requestId: input.requestId,
            sequence: nextSequence(),
          }),
        );
        continue;
      }

      if (next.done === true) break;

      if (next.value.type === "progress" && !input.stream.includeProgress) {
        pending = iterator.next();
        continue;
      }
      if (next.value.type === "artifact" && !input.stream.includeArtifacts) {
        pending = iterator.next();
        continue;
      }

      const envelope = envelopeForAgentEvent({
        event: next.value,
        provider: input.provider,
        requestId: input.requestId,
        sequence: nextSequence(),
        threadId: input.threadId,
      });
      terminal = terminalEventTypes.has(next.value.type);
      terminalStatus = terminalStatusForEvent(next.value);

      yield sseFrame(envelope);
      if (terminal) break;

      pending = iterator.next();
    }
  } catch (error) {
    if (!terminal) {
      const message = error instanceof Error ? error.message : "Agent stream failed.";
      const agentError: AgentError = {
        code: input.activeTurn.abortController.signal.aborted ? "cancelled" : "provider_error",
        message,
        provider: input.provider,
        retryable: !input.activeTurn.abortController.signal.aborted,
      };
      terminal = true;
      terminalStatus = agentError.code === "cancelled" ? "cancelled" : "failed";

      yield sseFrame({
        at: new Date().toISOString(),
        data: {
          error: publicAgentError(agentError),
          status: agentError.code === "cancelled" ? "cancelled" : "failed",
        },
        provider: input.provider,
        requestId: input.requestId,
        sequence: nextSequence(),
        sessionId: input.sessionId,
        threadId: input.threadId,
        type: agentError.code === "cancelled" ? "turn.cancelled" : "turn.failed",
      });
    }
  } finally {
    if (!terminal && !input.activeTurn.abortController.signal.aborted) {
      input.activeTurn.abortController.abort(new Error("Agent stream closed."));
    }
    input.runtime.activeAgentTurns.finish(
      input.provider,
      input.sessionId,
      terminalStatus ?? "cancelled",
    );
    await iterator.return?.();
  }
}
