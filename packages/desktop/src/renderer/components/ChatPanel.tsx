import type {
  AgentChatActivity,
  AgentChatActivityKind,
  AgentChatActivityStatus,
  AgentChatApprovalDecisionInput,
  AgentChatMessage,
  AgentChatProviderAvailability,
  AgentChatProviderProfile,
  AgentChatQuestion,
  AgentChatQuestionAnswer,
  AgentChatQuestionDraft,
  AgentChatQuestionItem,
  AgentChatQuestionStatus,
  AgentChatRuntimeMode,
  AgentChatThreadDetail,
  AgentChatThreadListEntry,
  AgentChatThreadStatus,
  AgentChatTimelineEntry,
  AgentChatTurnStatus,
} from "@cycle/ui/molecules";
import { AgentChatShell, type AgentChatTurnSettings } from "@cycle/ui/organisms";
import * as React from "react";
import type { ProfileConfig, RepositoryRecord } from "../../shared/AppConfig.ts";
import type { AgentProviderId, DetectedAgentProvider } from "../../shared/AgentProviders.ts";
import {
  chatWebSocketUrlForConnection,
  discoverCycleApiConnection,
  type CycleApiConnection,
} from "../lib/cycleApiClient.ts";
import { parseChatProtocolMessage, type ChatProtocolMessage } from "../lib/chatProtocol.ts";
import { createMarkdownTagSuggestions } from "../lib/markdownTagSuggestions.ts";
import { useIssueListQuery, useUserListQuery } from "../queries/index.ts";

type ChatPanelProps = {
  readonly agentProviders: readonly DetectedAgentProvider[];
  readonly profile?: ProfileConfig;
  readonly repositories: readonly RepositoryRecord[];
};

type PendingCommand = (message: ChatProtocolMessage) => void;

const defaultModelsByProvider: Record<AgentProviderId, readonly string[]> = {
  "claude-code": [],
  codex: [],
};

const thinkingLevels = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
];

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

const numberValue = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const booleanValue = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;

const arrayValue = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

const runtimeMode = (value: unknown): AgentChatRuntimeMode | null =>
  value === "read-only" || value === "workspace-write" || value === "full-access" ? value : null;

const threadOrigin = (value: unknown): AgentChatThreadListEntry["origin"] => {
  if (!isRecord(value)) return null;
  const kind = stringValue(value.kind);
  if (kind === undefined) return null;

  return {
    agentId: stringOrNull(value.agentId),
    commentId: stringOrNull(value.commentId),
    issueId: stringOrNull(value.issueId),
    jobId: stringOrNull(value.jobId),
    kind,
    label: stringOrNull(value.label),
    repositoryId: stringOrNull(value.repositoryId),
    trigger: stringOrNull(value.trigger),
  };
};

const threadStatus = (value: unknown): AgentChatThreadStatus => {
  if (
    value === "active" ||
    value === "archived" ||
    value === "draft" ||
    value === "error" ||
    value === "waiting"
  ) {
    return value;
  }
  return "draft";
};

const turnStatus = (value: unknown): AgentChatTurnStatus | null => {
  if (
    value === "cancelled" ||
    value === "completed" ||
    value === "failed" ||
    value === "queued" ||
    value === "running" ||
    value === "waiting_for_user"
  ) {
    return value;
  }
  return null;
};

const activityKind = (value: unknown): AgentChatActivityKind => {
  if (
    value === "error" ||
    value === "progress" ||
    value === "question" ||
    value === "system" ||
    value === "thinking" ||
    value === "tool" ||
    value === "usage"
  ) {
    return value;
  }
  return "progress";
};

const activityStatus = (value: unknown): AgentChatActivityStatus | null => {
  if (
    value === "cancelled" ||
    value === "completed" ||
    value === "failed" ||
    value === "pending" ||
    value === "running"
  ) {
    return value;
  }
  return null;
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

const questionStatus = (value: unknown): AgentChatQuestionStatus => {
  if (value === "answered" || value === "cancelled" || value === "expired" || value === "open") {
    return value;
  }
  return "open";
};

const providerAvailability = (value: unknown): AgentChatProviderAvailability => {
  if (value === "available" || value === "unsupported" || value === "unavailable") return value;
  return "unavailable";
};

const protocolThread = (value: unknown): AgentChatThreadListEntry | undefined => {
  if (!isRecord(value)) return undefined;
  const id = stringValue(value.id);
  const title = stringValue(value.title);
  if (id === undefined || title === undefined) return undefined;

  return {
    activeTurnId: stringOrNull(value.activeTurnId),
    archivedAt: stringOrNull(value.archivedAt),
    createdAt: stringOrNull(value.createdAt),
    id,
    lastError: stringOrNull(value.lastError),
    model: stringOrNull(value.model),
    origin: threadOrigin(value.origin),
    providerId: stringOrNull(value.providerId),
    runtimeMode: runtimeMode(value.runtimeMode),
    status: threadStatus(value.status),
    summary: stringOrNull(value.summary),
    thinkingLevel: stringOrNull(value.thinkingLevel),
    title,
    updatedAt: stringOrNull(value.updatedAt),
  };
};

const protocolMessage = (value: unknown, sequence?: number): AgentChatMessage | undefined => {
  if (!isRecord(value)) return undefined;
  const id = stringValue(value.id);
  const createdAt = stringValue(value.createdAt);
  const text = typeof value.text === "string" ? value.text : undefined;
  if (id === undefined || createdAt === undefined || text === undefined) return undefined;

  const role =
    value.role === "assistant" || value.role === "system" || value.role === "user"
      ? value.role
      : "assistant";

  return {
    createdAt,
    id,
    role,
    sequence: sequence ?? numberValue(value.timelineSequence) ?? numberValue(value.sequence),
    streaming: booleanValue(value.streaming),
    text,
    turnId: stringOrNull(value.turnId),
    updatedAt: stringOrNull(value.updatedAt),
  };
};

const protocolActivity = (value: unknown, sequence?: number): AgentChatActivity | undefined => {
  if (!isRecord(value)) return undefined;
  const id = stringValue(value.id);
  const createdAt = stringValue(value.createdAt);
  const title = stringValue(value.title);
  if (id === undefined || createdAt === undefined || title === undefined) return undefined;
  const payload = isRecord(value.payload) ? { ...value.payload } : null;
  const itemType = isRecord(payload) ? stringValue(payload.itemType) : undefined;
  if (itemType !== undefined && hiddenProviderItemTypes.has(itemType)) return undefined;

  return {
    createdAt,
    detail: stringOrNull(value.detail),
    id,
    kind: activityKind(value.kind),
    payload,
    sequence: sequence ?? numberValue(value.timelineSequence) ?? numberValue(value.sequence),
    status: activityStatus(value.status),
    title,
    turnId: stringOrNull(value.turnId),
    updatedAt: stringOrNull(value.updatedAt),
  };
};

const protocolQuestionItem = (value: unknown): AgentChatQuestionItem | undefined => {
  if (!isRecord(value)) return undefined;
  const id = stringValue(value.id);
  const header = stringValue(value.header);
  const question = stringValue(value.question);
  if (id === undefined || header === undefined || question === undefined) return undefined;

  return {
    header,
    id,
    multiSelect: value.multiSelect === true,
    options: arrayValue(value.options)
      .filter(isRecord)
      .map((option) => ({
        description: stringOrNull(option.description),
        disabled: option.disabled === true,
        label: stringValue(option.label) ?? "Option",
        value: stringValue(option.value),
      })),
    question,
  };
};

const protocolQuestion = (value: unknown, sequence?: number): AgentChatQuestion | undefined => {
  if (!isRecord(value)) return undefined;
  const id = stringValue(value.id);
  const createdAt = stringValue(value.createdAt);
  const prompt = stringValue(value.prompt);
  const turnId = stringValue(value.turnId);
  if (id === undefined || createdAt === undefined || prompt === undefined || turnId === undefined) {
    return undefined;
  }

  return {
    answeredAt: stringOrNull(value.answeredAt),
    createdAt,
    id,
    prompt,
    questions: arrayValue(value.questions).map(protocolQuestionItem).filter(isDefined),
    sequence: sequence ?? numberValue(value.timelineSequence) ?? numberValue(value.sequence),
    status: questionStatus(value.status),
    turnId,
    updatedAt: stringOrNull(value.updatedAt),
  };
};

const protocolProvider = (value: unknown): AgentChatProviderProfile | undefined => {
  if (!isRecord(value)) return undefined;
  const id = stringValue(value.id);
  const label = stringValue(value.label);
  if (id === undefined || label === undefined) return undefined;

  return {
    availability: providerAvailability(value.availability),
    defaultModel: stringOrNull(value.defaultModel),
    description: stringOrNull(value.description),
    id,
    label,
    models: arrayValue(value.models)
      .filter(isRecord)
      .map((model) => ({
        description: stringOrNull(model.description),
        disabled: model.disabled === true,
        id: stringValue(model.id) ?? "default",
        label: stringValue(model.label) ?? stringValue(model.id) ?? "Default",
      })),
    statusLabel: stringOrNull(value.statusLabel),
    thinkingLevels: arrayValue(value.thinkingLevels)
      .filter(isRecord)
      .map((level) => ({
        description: stringOrNull(level.description),
        disabled: level.disabled === true,
        id: stringValue(level.id) ?? "medium",
        label: stringValue(level.label) ?? stringValue(level.id) ?? "Medium",
      })),
  };
};

const isDefined = <A,>(value: A | undefined): value is A => value !== undefined;

const detectedProviderProfile = (provider: DetectedAgentProvider): AgentChatProviderProfile => {
  const availability =
    provider.status === "available"
      ? "available"
      : provider.status === "unsupported"
        ? "unsupported"
        : "unavailable";
  const models = provider.models ?? defaultModelsByProvider[provider.id];

  return {
    availability,
    defaultModel: provider.defaultModel ?? models[0] ?? null,
    description: availability === "available" ? null : (provider.message ?? null),
    id: provider.id,
    label: provider.name,
    models: models.map((model) => ({
      disabled: availability !== "available",
      id: model,
      label: model,
    })),
    statusLabel: provider.status,
    thinkingLevels: provider.id === "codex" ? thinkingLevels : [],
  };
};

const providerDefaultModel = (
  providers: readonly AgentChatProviderProfile[],
  providerId: string | null | undefined,
): string | null => {
  const provider = providers.find((candidate) => candidate.id === providerId);
  return provider?.defaultModel ?? provider?.models[0]?.id ?? null;
};

const supportedModelForProvider = (
  providers: readonly AgentChatProviderProfile[],
  providerId: string | null | undefined,
  model: string | null | undefined,
): string | null => {
  if (model === null || model === undefined) return null;
  const provider = providers.find((candidate) => candidate.id === providerId);
  if (provider === undefined) return null;
  return provider.models.some((candidate) => candidate.id === model && candidate.disabled !== true)
    ? model
    : null;
};

const firstAvailableProviderId = (providers: readonly AgentChatProviderProfile[]): string | null =>
  providers.find((provider) => provider.availability === "available")?.id ??
  providers[0]?.id ??
  null;

const messageEntry = (message: AgentChatMessage): AgentChatTimelineEntry => ({
  createdAt: message.createdAt,
  id: `message:${message.id}`,
  kind: "message",
  message,
  sequence: message.sequence,
});

const activityEntry = (activity: AgentChatActivity): AgentChatTimelineEntry => ({
  createdAt: activity.createdAt,
  id: `activity:${activity.id}`,
  kind: "activity",
  activity,
  sequence: activity.sequence,
});

const questionEntry = (question: AgentChatQuestion): AgentChatTimelineEntry => ({
  createdAt: question.createdAt,
  id: `question:${question.id}`,
  kind: "question",
  question,
  sequence: question.sequence,
});

const timelineEntryWithSequence = (
  entry: AgentChatTimelineEntry,
  sequence: number | undefined,
): AgentChatTimelineEntry => {
  if (sequence === undefined) return entry;
  if (entry.kind === "message") {
    return { ...entry, message: { ...entry.message, sequence }, sequence };
  }
  if (entry.kind === "activity") {
    return { ...entry, activity: { ...entry.activity, sequence }, sequence };
  }
  return { ...entry, question: { ...entry.question, sequence }, sequence };
};

const upsertTimelineEntry = (
  entries: readonly AgentChatTimelineEntry[],
  nextEntry: AgentChatTimelineEntry,
): readonly AgentChatTimelineEntry[] => {
  const existing = entries.find((entry) => entry.id === nextEntry.id);
  const preservedSequence = existing?.sequence ?? nextEntry.sequence;
  return [
    ...entries.filter((entry) => entry.id !== nextEntry.id),
    timelineEntryWithSequence(nextEntry, preservedSequence),
  ];
};

const threadTurnStatus = (thread: AgentChatThreadListEntry): AgentChatTurnStatus | null =>
  thread.activeTurnId ? "running" : null;

const detailFromSnapshot = (payload: unknown): AgentChatThreadDetail | undefined => {
  if (!isRecord(payload)) return undefined;
  const thread = protocolThread(payload.thread);
  if (thread === undefined) return undefined;

  const turns = arrayValue(payload.turns).filter(isRecord);
  const latestTurn = turns.at(-1);
  const messages = arrayValue(payload.messages).map(protocolMessage).filter(isDefined);
  const activities = arrayValue(payload.activities).map(protocolActivity).filter(isDefined);
  const questions = arrayValue(payload.questions).map(protocolQuestion).filter(isDefined);

  return {
    ...thread,
    timeline: [
      ...messages.map(messageEntry),
      ...activities.map(activityEntry),
      ...questions.map(questionEntry),
    ],
    turnStatus: turnStatus(latestTurn?.status) ?? threadTurnStatus(thread),
  };
};

const mergeDetailThread = (
  detail: AgentChatThreadDetail | undefined,
  thread: AgentChatThreadListEntry,
): AgentChatThreadDetail => ({
  ...(detail ?? { timeline: [] }),
  ...thread,
  turnStatus: thread.activeTurnId ? (detail?.turnStatus ?? threadTurnStatus(thread)) : null,
});

const sortThreads = (
  threads: readonly AgentChatThreadListEntry[],
): readonly AgentChatThreadListEntry[] =>
  [...threads].sort((left, right) => {
    const leftTime = new Date(left.updatedAt ?? left.createdAt ?? 0).getTime();
    const rightTime = new Date(right.updatedAt ?? right.createdAt ?? 0).getTime();
    if (leftTime !== rightTime) return rightTime - leftTime;
    return left.id.localeCompare(right.id);
  });

const commandResult = (message: ChatProtocolMessage): Readonly<Record<string, unknown>> => {
  const payload = isRecord(message.payload) ? message.payload : {};
  return isRecord(payload.result) ? payload.result : {};
};

const questionAnswersForProtocol = (
  answer: AgentChatQuestionAnswer,
): Readonly<Record<string, string | readonly string[]>> =>
  Object.fromEntries(
    answer.items.map((item) => [
      item.itemId,
      item.selectedOptionValues.length === 1
        ? (item.selectedOptionValues[0] ?? "")
        : item.selectedOptionValues,
    ]),
  );

export const ChatPanel = ({ agentProviders, profile, repositories }: ChatPanelProps) => {
  const repositoryIds = React.useMemo(
    () => repositories.map((repository) => repository.id),
    [repositories],
  );
  const primaryRepositoryId = repositoryIds[0];
  const issueSuggestionsQuery = useIssueListQuery(
    primaryRepositoryId,
    {
      limit: 25,
      orderBy: "updatedAt",
      orderDirection: "desc",
      status: "all",
    },
    repositoryIds,
  );
  const userSuggestionsQuery = useUserListQuery(primaryRepositoryId, {
    disabled: false,
    limit: 25,
  });
  const fallbackProviders = React.useMemo(
    () => agentProviders.map(detectedProviderProfile),
    [agentProviders],
  );
  const tagSuggestions = React.useMemo(
    () =>
      createMarkdownTagSuggestions({
        agentProviders,
        issues: issueSuggestionsQuery.data?.entries,
        profile,
        repositories,
        users: userSuggestionsQuery.data?.entries,
      }),
    [
      agentProviders,
      issueSuggestionsQuery.data?.entries,
      profile,
      repositories,
      userSuggestionsQuery.data?.entries,
    ],
  );
  const [runtimeProviders, setRuntimeProviders] = React.useState<
    readonly AgentChatProviderProfile[]
  >([]);
  const providers = runtimeProviders.length > 0 ? runtimeProviders : fallbackProviders;
  const [connectionStatus, setConnectionStatus] = React.useState<
    "connected" | "connecting" | "disconnected" | "failed" | "reconnecting"
  >("connecting");
  const [threads, setThreads] = React.useState<readonly AgentChatThreadListEntry[]>([]);
  const [detailsById, setDetailsById] = React.useState<
    Readonly<Record<string, AgentChatThreadDetail>>
  >({});
  const [selectedThreadId, setSelectedThreadId] = React.useState<string | null>(null);
  const [composerValue, setComposerValue] = React.useState("");
  const [draftProviderId, setDraftProviderId] = React.useState<string | null>(null);
  const [draftModel, setDraftModel] = React.useState<string | null>(null);
  const [draftRuntimeMode, setDraftRuntimeMode] = React.useState<AgentChatRuntimeMode | null>(null);
  const [draftThinkingLevel, setDraftThinkingLevel] = React.useState<string | null>(null);
  const [questionDrafts, setQuestionDrafts] = React.useState<
    Record<string, AgentChatQuestionDraft>
  >({});
  const socketRef = React.useRef<WebSocket | null>(null);
  const pendingCommandsRef = React.useRef<Map<string, PendingCommand>>(new Map());
  const commandSequenceRef = React.useRef(0);
  const selectedThreadIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    selectedThreadIdRef.current = selectedThreadId;
  }, [selectedThreadId]);

  const upsertThread = React.useCallback((thread: AgentChatThreadListEntry) => {
    setThreads((current) => {
      const existing = current.filter((candidate) => candidate.id !== thread.id);
      return sortThreads([thread, ...existing]);
    });
    setDetailsById((current) => ({
      ...current,
      [thread.id]: mergeDetailThread(current[thread.id], thread),
    }));
  }, []);

  const sendCommand = React.useCallback(
    (type: string, payload: Readonly<Record<string, unknown>> = {}, onAck?: PendingCommand) => {
      const socket = socketRef.current;
      if (socket === null || socket.readyState !== WebSocket.OPEN) return;

      const commandId = `chat_${++commandSequenceRef.current}`;
      if (onAck !== undefined) pendingCommandsRef.current.set(commandId, onAck);
      socket.send(
        JSON.stringify({
          commandId,
          payload,
          type,
          version: 1,
        }),
      );
    },
    [],
  );

  const subscribeThread = React.useCallback(
    (threadId: string) => {
      sendCommand("thread.subscribe", { threadId });
    },
    [sendCommand],
  );

  const removeThread = React.useCallback(
    (threadId: string) => {
      setThreads((current) => {
        const nextThreads = current.filter((thread) => thread.id !== threadId);
        if (selectedThreadIdRef.current === threadId) {
          const nextSelectedThreadId = nextThreads[0]?.id ?? null;
          selectedThreadIdRef.current = nextSelectedThreadId;
          setSelectedThreadId(nextSelectedThreadId);
          if (nextSelectedThreadId !== null) subscribeThread(nextSelectedThreadId);
        }
        return nextThreads;
      });
      setDetailsById((current) => {
        const { [threadId]: _deletedThread, ...remaining } = current;
        return remaining;
      });
    },
    [subscribeThread],
  );

  const handleThreadListSnapshot = React.useCallback(
    (payload: unknown) => {
      const nextThreads = isRecord(payload)
        ? arrayValue(payload.threads).map(protocolThread).filter(isDefined)
        : [];
      const sorted = sortThreads(nextThreads);
      setThreads(sorted);
      setDetailsById((current) => {
        const nextDetails = { ...current };
        for (const thread of sorted) {
          nextDetails[thread.id] = mergeDetailThread(nextDetails[thread.id], thread);
        }
        return nextDetails;
      });

      const currentSelectedId = selectedThreadIdRef.current;
      const selectedExists =
        currentSelectedId !== null && sorted.some((thread) => thread.id === currentSelectedId);
      const nextSelectedId = selectedExists ? currentSelectedId : (sorted[0]?.id ?? null);
      if (nextSelectedId !== currentSelectedId) {
        selectedThreadIdRef.current = nextSelectedId;
        setSelectedThreadId(nextSelectedId);
      }
      if (nextSelectedId !== null) subscribeThread(nextSelectedId);
    },
    [subscribeThread],
  );

  const handleServerMessage = React.useCallback(
    (message: ChatProtocolMessage) => {
      if (message.commandId !== undefined) {
        const pending = pendingCommandsRef.current.get(message.commandId);
        if (pending !== undefined) {
          pendingCommandsRef.current.delete(message.commandId);
          pending(message);
        }
      }

      const payload = message.payload;
      switch (message.type) {
        case "connection.ready": {
          setConnectionStatus("connected");
          sendCommand("provider.list");
          sendCommand("thread.list");
          const selected = selectedThreadIdRef.current;
          if (selected !== null) subscribeThread(selected);
          break;
        }

        case "provider.list.snapshot": {
          const providersPayload = isRecord(payload) ? payload.providers : undefined;
          setRuntimeProviders(arrayValue(providersPayload).map(protocolProvider).filter(isDefined));
          break;
        }

        case "thread.list.snapshot":
          handleThreadListSnapshot(payload);
          break;

        case "thread.snapshot": {
          const detail = detailFromSnapshot(payload);
          if (detail === undefined) break;
          upsertThread(detail);
          setDetailsById((current) => ({
            ...current,
            [detail.id]: detail,
          }));
          break;
        }

        case "thread.updated": {
          const thread = isRecord(payload) ? protocolThread(payload.thread) : undefined;
          if (thread !== undefined) upsertThread(thread);
          break;
        }

        case "thread.deleted": {
          const threadId =
            message.threadId ?? (isRecord(payload) ? stringValue(payload.threadId) : undefined);
          if (threadId !== undefined) removeThread(threadId);
          break;
        }

        case "message.created":
        case "message.completed": {
          const messagePayload = isRecord(payload)
            ? protocolMessage(payload.message, message.sequence)
            : undefined;
          const threadId = message.threadId;
          if (messagePayload === undefined || threadId === undefined) break;
          setDetailsById((current) => {
            const detail = current[threadId];
            if (detail === undefined) return current;
            return {
              ...current,
              [threadId]: {
                ...detail,
                timeline: upsertTimelineEntry(detail.timeline, messageEntry(messagePayload)),
              },
            };
          });
          break;
        }

        case "message.delta": {
          const threadId = message.threadId;
          if (threadId === undefined || !isRecord(payload)) break;
          const messageId = stringValue(payload.messageId);
          const delta = typeof payload.delta === "string" ? payload.delta : "";
          const snapshot = typeof payload.snapshot === "string" ? payload.snapshot : undefined;
          if (messageId === undefined) break;

          setDetailsById((current) => {
            const detail = current[threadId];
            if (detail === undefined) return current;
            return {
              ...current,
              [threadId]: {
                ...detail,
                timeline: detail.timeline.map((entry) => {
                  if (entry.kind !== "message" || entry.message.id !== messageId) return entry;
                  return {
                    ...entry,
                    message: {
                      ...entry.message,
                      streaming: true,
                      text: snapshot ?? `${entry.message.text}${delta}`,
                      updatedAt: message.createdAt ?? entry.message.updatedAt,
                    },
                  };
                }),
              },
            };
          });
          break;
        }

        case "activity.upserted": {
          const activity = isRecord(payload)
            ? protocolActivity(payload.activity, message.sequence)
            : undefined;
          const threadId = message.threadId;
          if (activity === undefined) break;
          setDetailsById((current) => {
            const detail = threadId === undefined ? undefined : current[threadId];
            if (detail === undefined) return current;
            return {
              ...current,
              [detail.id]: {
                ...detail,
                timeline: upsertTimelineEntry(detail.timeline, activityEntry(activity)),
              },
            };
          });
          break;
        }

        case "question.created": {
          const question = isRecord(payload)
            ? protocolQuestion(payload.question, message.sequence)
            : undefined;
          const threadId = message.threadId;
          if (question === undefined || threadId === undefined) break;
          setDetailsById((current) => {
            const detail = current[threadId];
            if (detail === undefined) return current;
            return {
              ...current,
              [detail.id]: {
                ...detail,
                timeline: upsertTimelineEntry(detail.timeline, questionEntry(question)),
              },
            };
          });
          break;
        }

        case "question.resolved": {
          const threadId = message.threadId;
          if (threadId === undefined || !isRecord(payload)) break;
          const questionId = stringValue(payload.questionId);
          if (questionId === undefined) break;
          setDetailsById((current) => {
            const detail = current[threadId];
            if (detail === undefined) return current;
            return {
              ...current,
              [threadId]: {
                ...detail,
                timeline: detail.timeline.map((entry) => {
                  if (entry.kind !== "question" || entry.question.id !== questionId) return entry;
                  return {
                    ...entry,
                    question: {
                      ...entry.question,
                      answeredAt: stringOrNull(payload.answeredAt),
                      status: questionStatus(payload.status),
                    },
                  };
                }),
              },
            };
          });
          setQuestionDrafts((current) => {
            const { [questionId]: _answered, ...rest } = current;
            return rest;
          });
          break;
        }

        case "approval.resolved": {
          const threadId = message.threadId;
          if (threadId === undefined || !isRecord(payload)) break;
          const requestId = stringValue(payload.requestId);
          const decision = stringValue(payload.decision);
          if (requestId === undefined) break;
          const activityId = `activity-approval_${requestId}`;

          setDetailsById((current) => {
            const detail = current[threadId];
            if (detail === undefined) return current;
            return {
              ...current,
              [threadId]: {
                ...detail,
                turnStatus: "running",
                timeline: detail.timeline.map((entry) => {
                  if (entry.kind !== "activity" || entry.activity.id !== activityId) return entry;
                  return {
                    ...entry,
                    activity: {
                      ...entry.activity,
                      detail: decision ?? entry.activity.detail,
                      payload: {
                        ...entry.activity.payload,
                        decision,
                        requestId,
                      },
                      status: "completed",
                      title: "Approval resolved",
                      updatedAt: message.createdAt ?? entry.activity.updatedAt,
                    },
                  };
                }),
              },
            };
          });
          setThreads((current) =>
            current.map((thread) =>
              thread.id === threadId
                ? {
                    ...thread,
                    status: thread.activeTurnId ? "active" : thread.status,
                  }
                : thread,
            ),
          );
          break;
        }

        case "turn.started":
        case "turn.completed":
        case "turn.failed":
        case "turn.cancelled": {
          if (!isRecord(payload) || !isRecord(payload.turn)) break;
          const turn = payload.turn;
          const threadId = stringValue(turn.threadId) ?? message.threadId;
          const status = turnStatus(turn.status);
          const active =
            status === "queued" || status === "running" || status === "waiting_for_user";
          if (threadId === undefined || status === null) break;
          const nextRuntimeMode = runtimeMode(turn.runtimeMode);
          const settingsPatch = {
            ...(typeof turn.model === "string" || turn.model === null
              ? { model: stringOrNull(turn.model) }
              : {}),
            ...(nextRuntimeMode === null ? {} : { runtimeMode: nextRuntimeMode }),
            ...(typeof turn.thinkingLevel === "string" || turn.thinkingLevel === null
              ? { thinkingLevel: stringOrNull(turn.thinkingLevel) }
              : {}),
          };

          setDetailsById((current) => {
            const detail = current[threadId];
            if (detail === undefined) return current;
            return {
              ...current,
              [threadId]: {
                ...detail,
                activeTurnId: active ? stringOrNull(turn.id) : null,
                lastError: stringOrNull(turn.lastError),
                ...settingsPatch,
                turnStatus: status,
              },
            };
          });
          setThreads((current) =>
            current.map((thread) =>
              thread.id === threadId
                ? {
                    ...thread,
                    activeTurnId: active ? stringOrNull(turn.id) : null,
                    lastError: stringOrNull(turn.lastError),
                    ...settingsPatch,
                    status:
                      status === "failed"
                        ? "error"
                        : active
                          ? status === "waiting_for_user"
                            ? "waiting"
                            : "active"
                          : thread.status,
                  }
                : thread,
            ),
          );
          break;
        }

        case "command.error":
          console.warn("Agent chat command failed.", payload);
          break;
      }
    },
    [handleThreadListSnapshot, removeThread, sendCommand, subscribeThread, upsertThread],
  );

  React.useEffect(() => {
    let disposed = false;
    let retryCount = 0;
    let retryTimer: number | undefined;

    const connect = async () => {
      setConnectionStatus(retryCount === 0 ? "connecting" : "reconnecting");

      let connection: CycleApiConnection;
      try {
        connection = await discoverCycleApiConnection();
      } catch (error) {
        console.warn("Unable to discover Cycle API connection.", error);
        if (!disposed) {
          setConnectionStatus("failed");
          retryTimer = window.setTimeout(connect, 2500);
        }
        return;
      }

      if (disposed) return;

      const socket = new WebSocket(chatWebSocketUrlForConnection(connection));
      socketRef.current = socket;

      socket.onopen = () => {
        retryCount = 0;
        socket.send(
          JSON.stringify({
            payload: {
              token: connection.token ?? "",
            },
            type: "connection.authenticate",
            version: 1,
          }),
        );
      };

      socket.onmessage = (event) => {
        try {
          handleServerMessage(parseChatProtocolMessage(String(event.data)));
        } catch (error) {
          console.warn("Agent chat socket received invalid message.", error);
        }
      };

      socket.onerror = () => {
        if (!disposed) setConnectionStatus("failed");
      };

      socket.onclose = () => {
        if (socketRef.current === socket) socketRef.current = null;
        pendingCommandsRef.current.clear();
        if (disposed) return;
        retryCount += 1;
        setConnectionStatus(retryCount === 1 ? "disconnected" : "reconnecting");
        retryTimer = window.setTimeout(connect, Math.min(1000 * retryCount, 5000));
      };
    };

    void connect();

    return () => {
      disposed = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      socketRef.current?.close();
      socketRef.current = null;
      pendingCommandsRef.current.clear();
    };
  }, [handleServerMessage]);

  React.useEffect(() => {
    if (connectionStatus !== "connected") return;

    const refresh = () => {
      sendCommand("thread.list");
      const selected = selectedThreadIdRef.current;
      if (selected !== null) subscribeThread(selected);
    };
    const timer = window.setInterval(refresh, 4000);

    return () => window.clearInterval(timer);
  }, [connectionStatus, sendCommand, subscribeThread]);

  const selectedThread = React.useMemo<AgentChatThreadDetail | null>(() => {
    if (selectedThreadId === null) return null;
    const detail = detailsById[selectedThreadId];
    if (detail !== undefined) return detail;
    const thread = threads.find((candidate) => candidate.id === selectedThreadId);
    return thread === undefined
      ? null
      : { ...thread, timeline: [], turnStatus: threadTurnStatus(thread) };
  }, [detailsById, selectedThreadId, threads]);

  const defaultProviderId = React.useMemo(() => firstAvailableProviderId(providers), [providers]);
  const selectedProviderId = selectedThread?.providerId ?? draftProviderId ?? defaultProviderId;
  const rawSelectedModel =
    selectedThread?.model ?? draftModel ?? providerDefaultModel(providers, selectedProviderId);
  const selectedModel = supportedModelForProvider(providers, selectedProviderId, rawSelectedModel);
  const selectedRuntimeMode = selectedThread?.runtimeMode ?? draftRuntimeMode ?? "read-only";
  const selectedThinkingLevel =
    selectedThread?.thinkingLevel ??
    draftThinkingLevel ??
    (selectedProviderId === "codex" ? "medium" : null);

  const patchSelectedThreadSettings = React.useCallback(
    (patch: {
      readonly model?: string | null;
      readonly providerId?: string | null;
      readonly runtimeMode?: AgentChatRuntimeMode | null;
      readonly thinkingLevel?: string | null;
    }) => {
      const threadId = selectedThreadIdRef.current;
      if (threadId === null) return;

      setThreads((current) =>
        current.map((thread) => (thread.id === threadId ? { ...thread, ...patch } : thread)),
      );
      setDetailsById((current) => {
        const detail = current[threadId];
        if (detail === undefined) return current;
        return {
          ...current,
          [threadId]: {
            ...detail,
            ...patch,
          },
        };
      });
    },
    [],
  );

  const patchThreadActivity = React.useCallback(
    (
      threadId: string,
      activityId: string,
      patch: Partial<AgentChatActivity>,
      payloadPatch?: Readonly<Record<string, unknown>>,
    ) => {
      setDetailsById((current) => {
        const detail = current[threadId];
        if (detail === undefined) return current;

        return {
          ...current,
          [threadId]: {
            ...detail,
            timeline: detail.timeline.map((entry) => {
              if (entry.kind !== "activity" || entry.activity.id !== activityId) return entry;

              return {
                ...entry,
                activity: {
                  ...entry.activity,
                  ...patch,
                  payload:
                    payloadPatch === undefined
                      ? entry.activity.payload
                      : {
                          ...entry.activity.payload,
                          ...payloadPatch,
                        },
                },
              };
            }),
          },
        };
      });
    },
    [],
  );

  const createThread = React.useCallback(() => {
    const providerId = selectedProviderId ?? defaultProviderId;
    const model = selectedModel ?? providerDefaultModel(providers, providerId);
    sendCommand(
      "thread.create",
      {
        ...(model === null ? {} : { model }),
        ...(providerId === null ? {} : { providerId }),
        runtimeMode: selectedRuntimeMode,
        ...(selectedThinkingLevel === null ? {} : { thinkingLevel: selectedThinkingLevel }),
      },
      (ack) => {
        const thread = protocolThread(commandResult(ack).thread);
        if (thread === undefined) return;
        upsertThread(thread);
        selectedThreadIdRef.current = thread.id;
        setSelectedThreadId(thread.id);
        subscribeThread(thread.id);
      },
    );
  }, [
    defaultProviderId,
    providers,
    selectedModel,
    selectedProviderId,
    selectedRuntimeMode,
    selectedThinkingLevel,
    sendCommand,
    subscribeThread,
    upsertThread,
  ]);

  const selectThread = React.useCallback(
    (threadId: string) => {
      selectedThreadIdRef.current = threadId;
      setSelectedThreadId(threadId);
      subscribeThread(threadId);
    },
    [subscribeThread],
  );

  const deleteThread = React.useCallback(
    (threadId: string) => {
      const thread = threads.find((candidate) => candidate.id === threadId);
      if (thread?.activeTurnId) return;

      const confirmed = window.confirm(
        `Delete "${thread?.title ?? "this chat"}"? This cannot be undone.`,
      );
      if (!confirmed) return;

      sendCommand("thread.delete", { threadId }, (ack) => {
        if (ack.type !== "command.ack") return;
        const result = commandResult(ack);
        removeThread(stringValue(result.threadId) ?? threadId);
      });
    },
    [removeThread, sendCommand, threads],
  );

  const sendMessage = React.useCallback(
    (text: string, settings: AgentChatTurnSettings) => {
      const threadId = selectedThreadIdRef.current;
      const providerId = settings.providerId ?? selectedProviderId;
      const model = supportedModelForProvider(
        providers,
        providerId,
        settings.model ?? selectedModel,
      );
      if (threadId === null || providerId === null) return;

      sendCommand("turn.send", {
        message: text,
        ...(model === null ? {} : { model }),
        providerId,
        runtimeMode: settings.runtimeMode ?? selectedRuntimeMode,
        ...((settings.thinkingLevel ?? selectedThinkingLevel)
          ? { thinkingLevel: settings.thinkingLevel ?? selectedThinkingLevel }
          : {}),
        threadId,
      });
      setComposerValue("");
    },
    [
      providers,
      selectedModel,
      selectedProviderId,
      selectedRuntimeMode,
      selectedThinkingLevel,
      sendCommand,
    ],
  );

  const cancelTurn = React.useCallback(
    (turnId: string) => {
      const threadId = selectedThreadIdRef.current;
      if (threadId === null) return;
      sendCommand("turn.cancel", { threadId, turnId });
    },
    [sendCommand],
  );

  const respondToApproval = React.useCallback(
    (input: AgentChatApprovalDecisionInput) => {
      const threadId = selectedThreadIdRef.current;
      if (threadId === null) return;

      patchThreadActivity(
        threadId,
        input.activity.id,
        {
          detail: input.decision,
          status: "running",
          updatedAt: new Date().toISOString(),
        },
        {
          decision: input.decision,
        },
      );

      sendCommand(
        "approval.respond",
        {
          decision: input.decision,
          requestId: input.requestId,
          threadId,
        },
        (ack) => {
          if (ack.type === "command.ack") {
            patchThreadActivity(
              threadId,
              input.activity.id,
              {
                detail: input.decision,
                status: "completed",
                title: "Approval resolved",
                updatedAt: ack.createdAt ?? new Date().toISOString(),
              },
              {
                decision: input.decision,
              },
            );
            return;
          }

          if (ack.type !== "command.error") return;
          const payload = isRecord(ack.payload) ? ack.payload : {};
          patchThreadActivity(
            threadId,
            input.activity.id,
            {
              detail: stringValue(payload.message) ?? "Approval response failed.",
              status: "failed",
              updatedAt: ack.createdAt ?? new Date().toISOString(),
            },
            {
              errorCode: stringValue(payload.code),
            },
          );
        },
      );
    },
    [patchThreadActivity, sendCommand],
  );

  const updateProvider = React.useCallback(
    (providerId: string | null) => {
      const model = providerDefaultModel(providers, providerId);
      setDraftProviderId(providerId);
      setDraftModel(model);
      patchSelectedThreadSettings({ model, providerId });
      const threadId = selectedThreadIdRef.current;
      if (threadId !== null) {
        sendCommand("thread.update_settings", { model, providerId, threadId });
      }
    },
    [patchSelectedThreadSettings, providers, sendCommand],
  );

  const updateModel = React.useCallback(
    (model: string | null) => {
      setDraftModel(model);
      patchSelectedThreadSettings({ model });
      const threadId = selectedThreadIdRef.current;
      if (threadId !== null) sendCommand("thread.update_settings", { model, threadId });
    },
    [patchSelectedThreadSettings, sendCommand],
  );

  const updateThinkingLevel = React.useCallback(
    (thinkingLevel: string | null) => {
      setDraftThinkingLevel(thinkingLevel);
      patchSelectedThreadSettings({ thinkingLevel });
      const threadId = selectedThreadIdRef.current;
      if (threadId !== null) {
        sendCommand("thread.update_settings", { thinkingLevel, threadId });
      }
    },
    [patchSelectedThreadSettings, sendCommand],
  );

  const updateRuntimeMode = React.useCallback(
    (nextRuntimeMode: AgentChatRuntimeMode | null) => {
      const resolvedRuntimeMode = nextRuntimeMode ?? "read-only";
      setDraftRuntimeMode(resolvedRuntimeMode);
      patchSelectedThreadSettings({ runtimeMode: resolvedRuntimeMode });
      const threadId = selectedThreadIdRef.current;
      if (threadId !== null) {
        sendCommand("thread.update_settings", { runtimeMode: resolvedRuntimeMode, threadId });
      }
    },
    [patchSelectedThreadSettings, sendCommand],
  );

  const answerQuestion = React.useCallback(
    (answer: AgentChatQuestionAnswer) => {
      const threadId = selectedThreadIdRef.current;
      if (threadId === null) return;
      sendCommand("question.respond", {
        answers: questionAnswersForProtocol(answer),
        questionId: answer.questionId,
        threadId,
      });
    },
    [sendCommand],
  );

  const updateQuestionDraft = React.useCallback(
    (questionId: string, itemId: string, selectedOptionValues: readonly string[]) => {
      setQuestionDrafts((current) => ({
        ...current,
        [questionId]: {
          ...current[questionId],
          [itemId]: selectedOptionValues,
        },
      }));
    },
    [],
  );

  const copyMessage = React.useCallback((message: AgentChatMessage) => {
    void navigator.clipboard?.writeText(message.text);
  }, []);

  return (
    <AgentChatShell
      composerValue={composerValue}
      connectionStatus={connectionStatus}
      model={selectedModel}
      onApprovalDecision={respondToApproval}
      onCancelTurn={cancelTurn}
      onComposerValueChange={setComposerValue}
      onCopyMessage={copyMessage}
      onCreateThread={connectionStatus === "connected" ? createThread : undefined}
      onMessageSend={sendMessage}
      onModelChange={updateModel}
      onProviderChange={updateProvider}
      onQuestionAnswer={answerQuestion}
      onQuestionDraftChange={updateQuestionDraft}
      onRuntimeModeChange={updateRuntimeMode}
      onThinkingLevelChange={updateThinkingLevel}
      onThreadDelete={connectionStatus === "connected" ? deleteThread : undefined}
      onThreadSelect={selectThread}
      providerId={selectedProviderId}
      providers={providers}
      questionDrafts={questionDrafts}
      runtimeMode={selectedRuntimeMode}
      selectedThread={selectedThread}
      selectedThreadId={selectedThreadId}
      tagSuggestions={tagSuggestions}
      thinkingLevel={selectedThinkingLevel}
      threads={threads}
    />
  );
};
