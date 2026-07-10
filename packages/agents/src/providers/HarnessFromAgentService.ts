import { DateTime, Effect, Stream } from "effect";
import type {
  AgentApprovalDecision,
  AgentEvent,
  AgentMcpAttachment,
  AgentSession,
  AgentService,
  AgentUserInputAnswer,
  JsonObject,
  JsonValue,
} from "../types.ts";
import { AgentHarnessError } from "../AgentErrors.ts";
import {
  AgentHarnessBinding,
  AgentHarnessEvent,
  type AgentHarness,
  type AgentHarnessCapabilities,
  type AgentHarnessOpenInput,
  type AgentHarnessSession,
} from "../AgentHarness.ts";

export type AgentHarnessMcpResolver = (
  input: AgentHarnessOpenInput,
) => Effect.Effect<AgentMcpAttachment>;

export type HarnessFromAgentServiceOptions = {
  readonly capabilities: AgentHarnessCapabilities;
  readonly harnessId: string;
  readonly mcp?: AgentMcpAttachment | AgentHarnessMcpResolver;
  readonly providerId: string;
  readonly service: AgentService;
};

const harnessError = (
  harnessId: string,
  reason: "Authentication" | "Interrupted" | "ProviderRejected" | "TransportFailed" | "Unknown",
  cause: unknown,
): AgentHarnessError =>
  new AgentHarnessError({
    code: `agent_harness_${reason.toLowerCase()}`,
    harnessId,
    message: cause instanceof Error ? cause.message : "Agent harness operation failed.",
    reason,
    retryable: reason === "TransportFailed" || reason === "Unknown",
  });

const taskPrompt = (input: AgentHarnessOpenInput): string => {
  const message = input.task.input.message;
  const current = typeof message === "string" ? message : JSON.stringify(input.task.input);
  const conversation = input.messages
    .filter(
      (entry) =>
        entry.visibility === "public" &&
        entry.status === "completed" &&
        entry.taskId !== input.task.taskId &&
        (entry.role === "user" || entry.role === "assistant"),
    )
    .map((entry) => {
      const text = entry.parts
        .filter((part) => part._tag === "text" || part._tag === "reasoning-summary")
        .map((part) => part.text)
        .join("");
      return text.length === 0
        ? undefined
        : `${entry.role === "user" ? "User" : "Assistant"}: ${text}`;
    })
    .filter((entry): entry is string => entry !== undefined)
    .join("\n\n");

  return conversation.length === 0
    ? current
    : `Conversation so far:\n${conversation}\n\nCurrent user message:\n${current}`;
};

const providerSessionId = (input: AgentHarnessOpenInput): string =>
  `agent_session_${input.task.threadId.replace("agent_thread_", "")}`;

const nativeThreadId = (session: AgentSession): string | undefined => {
  const id = session.native?.threadId ?? session.native?.sessionId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
};

const harnessBinding = (
  options: HarnessFromAgentServiceOptions,
  session: AgentSession,
): AgentHarnessBinding => {
  const threadId = nativeThreadId(session);
  return new AgentHarnessBinding({
    adapterVersion: "1",
    capabilities: options.capabilities,
    providerSessionId: session.id,
    ...(threadId === undefined ? {} : { providerThreadId: threadId }),
  });
};

const runtimeMode = (input: AgentHarnessOpenInput) => {
  switch (input.task.authority.mode) {
    case "conversation-read":
    case "repository-read":
      return "read-only" as const;
    case "implementation-worktree":
      return "full-access" as const;
    case "disposable-worktree":
      return "workspace-write" as const;
    case "operator-full-access":
      return "full-access" as const;
  }
};

const resolveMcp = Effect.fn("AgentHarness.resolveMcp")(function* (
  resolver: HarnessFromAgentServiceOptions["mcp"],
  input: AgentHarnessOpenInput,
) {
  if (resolver === undefined) return undefined;
  return typeof resolver === "function" ? yield* resolver(input) : resolver;
});

const jsonValue = (value: unknown): JsonValue | undefined => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    const items = value.map(jsonValue);
    return items.some((item) => item === undefined) ? undefined : (items as JsonValue[]);
  }
  if (typeof value !== "object" || value === null) return undefined;
  const output: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    const encoded = jsonValue(item);
    if (encoded !== undefined) output[key] = encoded;
  }
  return output;
};

const jsonObject = (value: unknown): JsonObject => {
  const encoded = jsonValue(value);
  return typeof encoded === "object" && encoded !== null && !Array.isArray(encoded)
    ? (encoded as JsonObject)
    : {};
};

const mapEvent = (event: AgentEvent): AgentHarnessEvent => {
  const common = {
    occurredAt: DateTime.makeUnsafe(event.at),
    providerTurnId: "turnId" in event ? event.turnId : undefined,
  };
  switch (event.type) {
    case "turn.started":
      return new AgentHarnessEvent({ ...common, eventType: "turn-started", payload: {} });
    case "text.delta":
      return new AgentHarnessEvent({
        ...common,
        eventType: "text-delta",
        payload: {
          delta: event.delta,
          ...(event.snapshot === undefined ? {} : { snapshot: event.snapshot }),
        },
      });
    case "content.delta":
      return new AgentHarnessEvent({
        ...common,
        eventType: event.streamKind.startsWith("reasoning") ? "reasoning-delta" : "text-delta",
        payload: { delta: event.delta, streamKind: event.streamKind },
        ...(event.itemId === undefined ? {} : { providerItemId: event.itemId }),
      });
    case "turn.plan.updated":
      return new AgentHarnessEvent({
        ...common,
        eventType: "plan-updated",
        payload: jsonObject(event),
      });
    case "turn.diff.updated":
      return new AgentHarnessEvent({
        ...common,
        eventType: "diff-updated",
        payload: { diff: event.diff },
      });
    case "item.started":
      return new AgentHarnessEvent({
        ...common,
        eventType: "tool-started",
        payload: jsonObject(event),
      });
    case "item.updated":
      return new AgentHarnessEvent({
        ...common,
        eventType: "tool-progress",
        payload: jsonObject(event),
      });
    case "item.completed":
      return new AgentHarnessEvent({
        ...common,
        eventType: "tool-completed",
        payload: jsonObject(event),
      });
    case "approval.requested":
      return new AgentHarnessEvent({
        ...common,
        eventType: "approval-requested",
        payload: jsonObject(event.request),
      });
    case "approval.resolved":
      return new AgentHarnessEvent({
        ...common,
        eventType: "approval-resolved",
        payload: jsonObject(event),
      });
    case "user-input.requested":
      return new AgentHarnessEvent({
        ...common,
        eventType: "user-input-requested",
        payload: jsonObject(event.request),
      });
    case "user-input.resolved":
      return new AgentHarnessEvent({
        ...common,
        eventType: "user-input-resolved",
        payload: jsonObject(event),
      });
    case "artifact":
      return new AgentHarnessEvent({
        ...common,
        eventType: "artifact",
        payload: jsonObject(event.artifact),
      });
    case "usage":
      return new AgentHarnessEvent({
        ...common,
        eventType: "usage",
        payload: jsonObject(event.usage),
      });
    case "runtime.warning":
    case "progress":
      return new AgentHarnessEvent({ ...common, eventType: "warning", payload: jsonObject(event) });
    case "runtime.error":
    case "turn.failed":
      return new AgentHarnessEvent({
        ...common,
        eventType: "failed",
        payload: jsonObject(event.error),
      });
    case "turn.cancelled":
      return new AgentHarnessEvent({
        ...common,
        eventType: "cancelled",
        payload: jsonObject(event.error),
      });
    case "turn.completed":
      return new AgentHarnessEvent({
        ...common,
        eventType: "completed",
        payload: { summary: event.result.text, usage: jsonObject(event.result.usage ?? {}) },
      });
  }
};

export const makeHarnessFromAgentService = (
  options: HarnessFromAgentServiceOptions,
): AgentHarness => {
  const openWithBinding = Effect.fn("AgentHarness.openWithBinding")(function* (
    input: AgentHarnessOpenInput,
    previous?: AgentHarnessBinding,
  ) {
    const mcp = yield* resolveMcp(options.mcp, input);
    const sessionId = previous?.providerSessionId ?? providerSessionId(input);
    const providerSession = yield* Effect.tryPromise({
      try: () =>
        options.service.resumeSession(
          sessionId,
          previous?.providerThreadId === undefined
            ? undefined
            : {
                native: {
                  initialized: true,
                  sessionId: previous.providerThreadId,
                  threadId: previous.providerThreadId,
                },
              },
        ),
      catch: (cause) => harnessError(options.harnessId, "TransportFailed", cause),
    });
    yield* Effect.addFinalizer(() =>
      Effect.tryPromise({
        try: () => options.service.abortTurn(sessionId),
        catch: (cause) => harnessError(options.harnessId, "Interrupted", cause),
      }).pipe(
        Effect.asVoid,
        Effect.catch(() => Effect.void),
      ),
    );

    const events = Stream.fromAsyncIterable(
      options.service.stream(sessionId, {
        context: jsonObject({
          attemptId: input.attempt.attemptId,
          cwd: input.task.authority.workspacePath,
          repositoryId: input.task.authority.repositoryId,
          runId: input.run.runId,
          taskId: input.task.taskId,
          threadId: input.task.threadId,
          ticketId: input.task.authority.ticketId,
          workspacePath: input.task.authority.workspacePath,
        }),
        input: taskPrompt(input),
        ...(mcp === undefined ? {} : { mcp }),
        ...(input.task.model === undefined ? {} : { model: { id: input.task.model } }),
        runtimeMode: runtimeMode(input),
        metadata: jsonObject({
          authorityMode: input.task.authority.mode,
          cwd: input.task.authority.workspacePath,
          workspacePath: input.task.authority.workspacePath,
        }),
      }),
      (cause) => harnessError(options.harnessId, "TransportFailed", cause),
    ).pipe(Stream.map(mapEvent));

    const session: AgentHarnessSession = {
      binding: harnessBinding(options, providerSession),
      events,
      refreshBinding: Effect.tryPromise({
        try: () => options.service.resumeSession(sessionId),
        catch: (cause) => harnessError(options.harnessId, "TransportFailed", cause),
      }).pipe(Effect.map((current) => harnessBinding(options, current))),
      interrupt: () =>
        Effect.tryPromise({
          try: () => options.service.abortTurn(sessionId),
          catch: (cause) => harnessError(options.harnessId, "Interrupted", cause),
        }).pipe(Effect.asVoid),
      respond: (response) => {
        const value = response.response;
        const providerRequestId = response.providerRequestId ?? response.interactionId;
        const decision: AgentApprovalDecision =
          value === true || value === "accept" ? "accept" : "decline";
        const answers: ReadonlyArray<AgentUserInputAnswer> = Array.isArray(value)
          ? value.filter(
              (item): item is AgentUserInputAnswer =>
                typeof item === "object" &&
                item !== null &&
                "questionId" in item &&
                "value" in item,
            )
          : [];
        return Effect.tryPromise({
          try: () =>
            answers.length > 0
              ? options.service.respondToUserInput(sessionId, providerRequestId, answers)
              : options.service.respondToApproval(sessionId, providerRequestId, decision),
          catch: (cause) => harnessError(options.harnessId, "ProviderRejected", cause),
        }).pipe(Effect.asVoid);
      },
      steer: () =>
        Effect.fail(
          harnessError(
            options.harnessId,
            "ProviderRejected",
            new Error("Live steering is not supported by this provider adapter."),
          ),
        ),
    };
    return session;
  });

  const open = (input: AgentHarnessOpenInput) => openWithBinding(input);

  return {
    capabilities: options.capabilities,
    detect: Effect.succeed({ available: true }),
    id: options.harnessId,
    open,
    providerId: options.providerId,
    reattach: (input) => openWithBinding(input, input.binding),
  };
};
