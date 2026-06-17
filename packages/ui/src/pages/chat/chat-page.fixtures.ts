import type { AgentChatShellProps } from "../../organisms/agent-chat/index.ts";
import type {
  AgentChatProviderProfile,
  AgentChatQuestionDraft,
  AgentChatThreadDetail,
  AgentChatThreadListEntry,
  AgentChatTimelineEntry,
} from "../../molecules/agent-chat/index.ts";

export type AgentChatFixtureVariant =
  | "activity"
  | "cancelled"
  | "disconnected"
  | "empty"
  | "failed"
  | "multi-question"
  | "multiple-active"
  | "provider-controls"
  | "single-question"
  | "streaming";

export const agentChatRelativeBase = "2026-06-16T10:20:00.000Z";

export const agentChatProviders: readonly AgentChatProviderProfile[] = [
  {
    defaultModel: "gpt-5-codex",
    description: "Local Codex agent runtime",
    id: "codex",
    label: "Codex",
    models: [
      {
        id: "gpt-5-codex",
        label: "GPT-5 Codex",
      },
      {
        id: "gpt-5-codex-mini",
        label: "GPT-5 Codex Mini",
      },
    ],
    thinkingLevels: [
      {
        description: "Use for quick mechanical edits.",
        id: "low",
        label: "Low",
      },
      {
        description: "Balanced reasoning for normal implementation work.",
        id: "medium",
        label: "Medium",
      },
      {
        description: "Use when the code path is risky or underspecified.",
        id: "high",
        label: "High",
      },
    ],
  },
  {
    availability: "unavailable",
    description: "Available once the desktop detector finds the binary.",
    id: "claude",
    label: "Claude Code",
    models: [
      {
        id: "opus",
        label: "Opus",
      },
      {
        id: "sonnet",
        label: "Sonnet",
      },
    ],
    statusLabel: "Not installed",
  },
  {
    availability: "unsupported",
    description: "Provider adapter is not enabled in this build.",
    id: "opencode",
    label: "OpenCode",
    models: [
      {
        disabled: true,
        id: "opencode-default",
        label: "Default",
      },
    ],
    statusLabel: "Unsupported",
  },
];

const baseThreads: readonly AgentChatThreadListEntry[] = [
  {
    activeTurnId: "turn-debug-1",
    createdAt: "2026-06-16T08:30:00.000Z",
    id: "thread-debug",
    model: "gpt-5-codex",
    providerId: "codex",
    status: "active",
    summary: "Trace the order merge regression and propose the smallest fix.",
    thinkingLevel: "medium",
    title: "Debug duplicate pending orders",
    unreadCount: 1,
    updatedAt: "2026-06-16T10:12:00.000Z",
  },
  {
    activeTurnId: "turn-tax-1",
    createdAt: "2026-06-15T16:20:00.000Z",
    id: "thread-tax",
    model: "gpt-5-codex-mini",
    providerId: "codex",
    status: "waiting",
    summary: "Agent needs a decision before editing the tax projection.",
    thinkingLevel: "high",
    title: "Investigate location tax mismatch",
    unreadCount: 2,
    updatedAt: "2026-06-16T09:55:00.000Z",
  },
  {
    createdAt: "2026-06-15T11:15:00.000Z",
    id: "thread-ci",
    lastError: "Test runner exited with code 1.",
    model: "gpt-5-codex",
    providerId: "codex",
    status: "error",
    summary: "CI failure reproduced, but the last turn failed before summary.",
    thinkingLevel: "medium",
    title: "Fix flaky checkout tax spec",
    updatedAt: "2026-06-16T08:42:00.000Z",
  },
  {
    archivedAt: "2026-06-13T18:00:00.000Z",
    createdAt: "2026-06-12T14:30:00.000Z",
    id: "thread-archived",
    model: "gpt-5-codex-mini",
    providerId: "codex",
    status: "archived",
    summary: "Completed concurrency notes for the historical migration.",
    title: "Summarize migration notes",
    updatedAt: "2026-06-13T17:45:00.000Z",
  },
];

const messageEntry = (
  id: string,
  role: "assistant" | "system" | "user",
  text: string,
  createdAt: string,
  sequence: number,
  streaming = false,
): AgentChatTimelineEntry => ({
  id,
  kind: "message",
  message: {
    createdAt,
    id,
    role,
    sequence,
    streaming,
    text,
    turnId: role === "user" ? null : "turn-debug-1",
  },
  sequence,
});

const activityTimeline: readonly AgentChatTimelineEntry[] = [
  messageEntry(
    "message-user-1",
    "user",
    "Can you investigate why `order_injection_concurrency.spec.ts` is failing and identify the smallest fix?",
    "2026-06-16T10:00:00.000Z",
    1,
  ),
  {
    activity: {
      createdAt: "2026-06-16T10:01:00.000Z",
      detail: "Checking the failure signature and recent changes around pending order merges.",
      id: "activity-thinking-1",
      kind: "thinking",
      status: "completed",
      title: "Built investigation plan",
    },
    id: "activity-thinking-1",
    kind: "activity",
    sequence: 2,
  },
  {
    activity: {
      createdAt: "2026-06-16T10:03:00.000Z",
      detail: "Reproduced the duplicate pending order assertion locally.",
      id: "activity-tool-1",
      kind: "tool",
      payload: {
        command: "pnpm test order_injection_concurrency",
        duration: "24s",
        exitCode: 1,
      },
      status: "completed",
      title: "Ran targeted test",
    },
    id: "activity-tool-1",
    kind: "activity",
    sequence: 3,
  },
  {
    activity: {
      createdAt: "2026-06-16T10:06:00.000Z",
      detail: "Following writes through mergePendingOrderLines and the tax projection update.",
      id: "activity-progress-1",
      kind: "progress",
      payload: {
        files: 3,
      },
      status: "running",
      title: "Tracing write path",
    },
    id: "activity-progress-1",
    kind: "activity",
    sequence: 4,
  },
  messageEntry(
    "message-assistant-1",
    "assistant",
    [
      "The failure reproduces locally. The strongest lead is a race in the pending order merge step when two order updates share the same transaction window.",
      "",
      "Next I am checking whether `mergePendingOrderLines` should lock before inserting or whether the unique key conflict path should be made idempotent.",
    ].join("\n"),
    "2026-06-16T10:08:00.000Z",
    5,
  ),
  {
    activity: {
      createdAt: "2026-06-16T10:09:00.000Z",
      detail: "Prompt 3,420 tokens. Completion 782 tokens.",
      id: "activity-usage-1",
      kind: "usage",
      payload: {
        completionTokens: 782,
        promptTokens: 3420,
        totalTokens: 4202,
      },
      status: "completed",
      title: "Usage summary",
    },
    id: "activity-usage-1",
    kind: "activity",
    sequence: 6,
  },
];

const streamingTimeline: readonly AgentChatTimelineEntry[] = [
  messageEntry(
    "message-user-streaming",
    "user",
    "Check the failing test and keep me posted as you find evidence.",
    "2026-06-16T10:05:00.000Z",
    1,
  ),
  {
    activity: {
      createdAt: "2026-06-16T10:06:00.000Z",
      detail: "Running the targeted spec and collecting the first failure.",
      id: "activity-streaming-progress",
      kind: "progress",
      status: "running",
      title: "Reproducing failure",
    },
    id: "activity-streaming-progress",
    kind: "activity",
    sequence: 2,
  },
  messageEntry(
    "message-assistant-streaming",
    "assistant",
    "I reproduced the failure and found the assertion that flips first. The duplicate row appears before the projection checks the existing pending order key",
    "2026-06-16T10:07:00.000Z",
    3,
    true,
  ),
];

const singleQuestionTimeline: readonly AgentChatTimelineEntry[] = [
  ...activityTimeline.slice(0, 4),
  {
    id: "question-single",
    kind: "question",
    question: {
      createdAt: "2026-06-16T10:10:00.000Z",
      id: "question-single",
      prompt: "Choose the next action",
      questions: [
        {
          header: "Investigation path",
          id: "path",
          multiSelect: false,
          options: [
            {
              description: "Make the smallest code change and prove it with the failing spec.",
              label: "Patch mergePendingOrderLines and add a regression test",
            },
            {
              description: "Spend another pass comparing historical behavior before editing.",
              label: "Continue read-only analysis",
            },
          ],
          question: "How should the agent proceed?",
        },
      ],
      status: "open",
      turnId: "turn-debug-1",
    },
    sequence: 5,
  },
];

const multiQuestionTimeline: readonly AgentChatTimelineEntry[] = [
  ...activityTimeline.slice(0, 4),
  {
    id: "question-multi",
    kind: "question",
    question: {
      createdAt: "2026-06-16T10:11:00.000Z",
      id: "question-multi",
      prompt: "Select what to include in the next turn",
      questions: [
        {
          header: "Evidence to collect",
          id: "evidence",
          multiSelect: true,
          options: [
            {
              description: "Rerun the targeted spec after each proposed change.",
              label: "Regression test output for order_injection_concurrency.spec.ts",
            },
            {
              description: "Show the insert/update path and explain the lock boundary.",
              label: "Code path notes for mergePendingOrderLines and the tax projection",
            },
            {
              description: "Include a short note if adjacent tickets touch the same tables.",
              label: "Linked issue impact check with long labels that wrap cleanly",
            },
          ],
          question: "Which evidence should the agent gather before summarizing?",
        },
      ],
      status: "open",
      turnId: "turn-debug-1",
    },
    sequence: 5,
  },
];

const failedTimeline: readonly AgentChatTimelineEntry[] = [
  ...activityTimeline.slice(0, 3),
  {
    activity: {
      createdAt: "2026-06-16T10:07:00.000Z",
      detail: "Provider process exited while reading the repository diff.",
      id: "activity-failed",
      kind: "error",
      payload: {
        code: "PROVIDER_EXITED",
      },
      status: "failed",
      title: "Turn failed",
    },
    id: "activity-failed",
    kind: "activity",
    sequence: 4,
  },
];

const cancelledTimeline: readonly AgentChatTimelineEntry[] = [
  ...activityTimeline.slice(0, 3),
  {
    activity: {
      createdAt: "2026-06-16T10:07:00.000Z",
      detail: "The user cancelled the active turn before any file changes were made.",
      id: "activity-cancelled",
      kind: "system",
      status: "cancelled",
      title: "Turn cancelled",
    },
    id: "activity-cancelled",
    kind: "activity",
    sequence: 4,
  },
];

const baseDetail = (timeline: readonly AgentChatTimelineEntry[]): AgentChatThreadDetail => ({
  ...baseThreads[0],
  timeline,
  turnStatus: "running",
});

const noop = () => undefined;

export const createAgentChatFixture = (
  variant: AgentChatFixtureVariant = "activity",
): AgentChatShellProps => {
  if (variant === "empty") {
    return {
      connectionStatus: "connected",
      emptyMessage: "No chat threads yet",
      onCreateThread: noop,
      onThreadSelect: noop,
      providers: agentChatProviders,
      relativeBase: agentChatRelativeBase,
      selectedThread: null,
      selectedThreadId: null,
      threads: [],
    };
  }

  const selectedThread =
    variant === "streaming" || variant === "multiple-active"
      ? baseDetail(streamingTimeline)
      : variant === "single-question"
        ? {
            ...baseDetail(singleQuestionTimeline),
            status: "waiting" as const,
            turnStatus: "waiting_for_user" as const,
          }
        : variant === "multi-question"
          ? {
              ...baseDetail(multiQuestionTimeline),
              status: "waiting" as const,
              turnStatus: "waiting_for_user" as const,
            }
          : variant === "failed"
            ? {
                ...baseDetail(failedTimeline),
                activeTurnId: null,
                lastError: "Provider process exited while reading the repository diff.",
                status: "error" as const,
                turnStatus: "failed" as const,
              }
            : variant === "cancelled"
              ? {
                  ...baseDetail(cancelledTimeline),
                  activeTurnId: null,
                  status: "active" as const,
                  turnStatus: "cancelled" as const,
                }
              : variant === "provider-controls"
                ? {
                    ...baseDetail(activityTimeline),
                    activeTurnId: null,
                    model: "opus",
                    providerId: "claude",
                    thinkingLevel: "high",
                    turnStatus: "completed" as const,
                  }
                : {
                    ...baseDetail(activityTimeline),
                    activeTurnId: null,
                    turnStatus: "completed" as const,
                  };

  const threads =
    variant === "multiple-active"
      ? baseThreads.map((thread) =>
          thread.id === "thread-ci"
            ? {
                ...thread,
                activeTurnId: "turn-ci-1",
                status: "active" as const,
              }
            : thread,
        )
      : variant === "provider-controls"
        ? baseThreads.map((thread) =>
            thread.id === "thread-debug"
              ? {
                  ...thread,
                  activeTurnId: null,
                  model: "opus",
                  providerId: "claude",
                  thinkingLevel: "high",
                }
              : thread,
          )
        : baseThreads;

  return {
    connectionStatus: variant === "disconnected" ? "reconnecting" : "connected",
    model: selectedThread.model,
    onCancelTurn: noop,
    onComposerValueChange: noop,
    onCopyMessage: noop,
    onCreateThread: noop,
    onMessageSend: noop,
    onModelChange: noop,
    onProviderChange: noop,
    onQuestionAnswer: noop,
    onQuestionDraftChange: noop,
    onThinkingLevelChange: noop,
    onThreadSelect: noop,
    providerId: selectedThread.providerId,
    providers: agentChatProviders,
    relativeBase: agentChatRelativeBase,
    selectedThread,
    selectedThreadId: selectedThread.id,
    thinkingLevel: selectedThread.thinkingLevel,
    threads,
  };
};

export const withQuestionDraft = (props: AgentChatShellProps): AgentChatShellProps => {
  const drafts: Record<string, AgentChatQuestionDraft> = {
    "question-multi": {
      evidence: [
        "Regression test output for order_injection_concurrency.spec.ts",
        "Code path notes for mergePendingOrderLines and the tax projection",
      ],
    },
    "question-single": {
      path: ["Patch mergePendingOrderLines and add a regression test"],
    },
  };

  return {
    ...props,
    questionDrafts: drafts,
  };
};
