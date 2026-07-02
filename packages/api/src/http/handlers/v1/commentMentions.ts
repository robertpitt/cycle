import {
  isAgentProviderId,
  type AgentProviderId,
  type AgentProviderProfile,
  type AgentTurnResult,
} from "@cycle/agents";
import { Effect } from "effect";
import type {
  AgentChatMessageRecord,
  AgentChatStoreShape,
  AgentChatThreadRecord,
  AgentChatTurnRecord,
  CycleApiRuntimeShape,
} from "../../runtime/CycleApiRuntime.ts";
import { CycleApiRuntime } from "../../runtime/CycleApiRuntime.ts";
import { prepareChatTurn, requestOrigin, bodyFromResult } from "./chat/prepare.ts";

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

export const handleSuccessfulCommentMentions = (input: {
  readonly body: string;
  readonly comment: unknown;
  readonly commentId: string;
  readonly repositoryId: string;
  readonly request: { readonly headers: any; readonly url: string };
  readonly requestId: string;
  readonly ticketId: string;
}): Effect.Effect<void, never, CycleApiRuntime> =>
  Effect.gen(function* () {
    const mentions = parseAgentMentions(input.body);
    if (mentions.length === 0) return;

    const runtime = yield* CycleApiRuntime;
    const chatStore = runtime.agentChatStore;
    if (chatStore === undefined) return;

    const profiles = yield* Effect.promise(() =>
      runtime.agentProviderProfiles().catch(() => [] as readonly AgentProviderProfile[]),
    );
    const origin = requestOrigin(input.request);

    for (const providerId of mentions) {
      const records = seedMentionThread({
        body: input.body,
        comment: input.comment,
        commentId: input.commentId,
        now: runtime.now().toISOString(),
        profile: profiles.find((profile) => profile.provider === providerId),
        providerId,
        repositoryId: input.repositoryId,
        ticketId: input.ticketId,
      });
      yield* Effect.promise(() => persistSeededThread(chatStore, records));
      void runMentionTurn({
        chatStore,
        origin,
        profile: records.profile,
        runtime,
        seedMessage: records.seedMessage,
        thread: records.thread,
        turn: records.turn,
      });
    }
  }).pipe(Effect.catch(() => Effect.void));

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

const runMentionTurn = async (input: {
  readonly chatStore: AgentChatStoreShape;
  readonly origin: string;
  readonly profile?: AgentProviderProfile;
  readonly runtime: CycleApiRuntimeShape;
  readonly seedMessage: AgentChatMessageRecord;
  readonly thread: AgentChatThreadRecord;
  readonly turn: AgentChatTurnRecord;
}): Promise<void> => {
  const providerId = input.turn.providerId as AgentProviderId;
  const sessionId = input.thread.sessionId ?? input.thread.id;
  const blocker = providerExecutionBlocker(input.runtime, input.profile, providerId);
  if (blocker !== undefined) {
    await failMentionTurn(input, blocker);
    return;
  }

  const activeTurn = input.runtime.activeAgentTurns.begin({
    provider: providerId,
    requestId: input.turn.id,
    sessionId,
    threadId: input.thread.id,
  });
  if (!activeTurn.active) {
    await failMentionTurn(input, "A chat turn is already active for this thread.");
    return;
  }

  try {
    await input.chatStore.upsertTurn?.({
      ...input.turn,
      status: "running",
      updatedAt: input.runtime.now().toISOString(),
    });
    const service = await Effect.runPromise(input.runtime.agentServices.serviceFor(providerId));
    const prepared = prepareChatTurn({
      origin: input.origin,
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
      runtime: input.runtime,
    });
    const result = await service.run(prepared.sessionId, {
      ...prepared.agentRequest,
      signal: activeTurn.record.abortController.signal,
    });
    await completeMentionTurn(input, result);
  } catch (error) {
    await failMentionTurn(input, error instanceof Error ? error.message : String(error));
  } finally {
    input.runtime.activeAgentTurns.finish(providerId, sessionId);
  }
};

const completeMentionTurn = async (
  input: Parameters<typeof runMentionTurn>[0],
  result: AgentTurnResult,
) => {
  const completedAt = (result.completedAt ?? input.runtime.now()).toISOString();
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
  if (assistantMessage !== undefined) await input.chatStore.upsertMessage(assistantMessage);

  await input.chatStore.upsertTurn?.({
    ...input.turn,
    ...(assistantMessage === undefined ? {} : { assistantMessageId: assistantMessage.id }),
    completedAt,
    lastError: error ?? null,
    status,
    updatedAt: completedAt,
  });
  await input.chatStore.upsertThread({
    ...input.thread,
    activeTurnId: null,
    lastError: error ?? null,
    status: status === "failed" ? "error" : "active",
    summary: error ?? assistantMessage?.body.slice(0, 160) ?? input.thread.summary,
    updatedAt: completedAt,
  });
  await input.chatStore.upsertActivity?.({
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

const failMentionTurn = async (input: Parameters<typeof runMentionTurn>[0], message: string) => {
  const completedAt = input.runtime.now().toISOString();
  await input.chatStore.upsertTurn?.({
    ...input.turn,
    completedAt,
    lastError: message,
    status: "failed",
    updatedAt: completedAt,
  });
  await input.chatStore.upsertThread({
    ...input.thread,
    activeTurnId: null,
    lastError: message,
    status: "error",
    summary: message,
    updatedAt: completedAt,
  });
  await input.chatStore.upsertActivity?.({
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

const providerExecutionBlocker = (
  runtime: CycleApiRuntimeShape,
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
    runtime.activeAgentTurns.countByProvider(providerId) >= maxConcurrentRuns
  ) {
    return `${profile.displayName} has reached its configured concurrency limit.`;
  }

  return undefined;
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
