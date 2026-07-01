import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import {
  AgentChatActivityRow,
  AgentChatActivityStrip,
  AgentChatApprovalCard,
  AgentChatConnectionStatusBanner,
  AgentChatMessageRow,
  AgentChatProviderModelPicker,
  AgentChatQuestionCard,
  AgentChatRuntimeModePicker,
  AgentChatThinkingSelector,
  AgentChatThreadListItem,
  AgentChatTurnStatusIndicator,
  type AgentChatActivity,
  type AgentChatProviderProfile,
  type AgentChatQuestionDraft,
} from "./index.ts";

const providers: readonly AgentChatProviderProfile[] = [
  {
    id: "codex",
    label: "Codex",
    models: [
      {
        id: "gpt-5-codex",
        label: "GPT-5 Codex",
      },
    ],
    thinkingLevels: [
      {
        id: "low",
        label: "Low",
      },
      {
        id: "medium",
        label: "Medium",
      },
      {
        id: "high",
        label: "High",
      },
    ],
  },
  {
    availability: "unavailable",
    id: "claude",
    label: "Claude Code",
    models: [
      {
        id: "opus",
        label: "Opus",
      },
    ],
    statusLabel: "Not installed",
  },
];

const activityStripItems: readonly AgentChatActivity[] = [
  {
    createdAt: "2026-06-16T09:42:00.000Z",
    id: "strip-mcp-1",
    kind: "tool",
    payload: {
      event: {
        _tag: "ToolCompleted",
        input: {
          server: "repo",
          tool: "read_file",
          arguments: { path: "src/orders/pending-order-merge.ts" },
        },
        output: "Read 120 lines.",
        toolCallId: "tool_call_1",
        toolName: "mcp_tool_call",
      },
      eventType: "tool.completed",
    },
    status: "completed",
    title: "mcp_tool_call",
  },
  {
    createdAt: "2026-06-16T09:42:05.000Z",
    detail: "list_mcp_resource_templates",
    id: "strip-mcp-2",
    kind: "tool",
    payload: {
      itemType: "mcpToolCall",
    },
    status: "completed",
    title: "MCP tool",
  },
  {
    createdAt: "2026-06-16T09:42:12.000Z",
    id: "strip-command-1",
    kind: "tool",
    payload: {
      event: {
        _tag: "ToolCompleted",
        input: {
          command: "pnpm test order_injection_concurrency",
        },
        output: "1 failing assertion.",
        toolCallId: "tool_call_2",
        toolName: "command_execution",
      },
      eventType: "tool.completed",
    },
    status: "completed",
    title: "command_execution",
  },
  {
    createdAt: "2026-06-16T09:42:22.000Z",
    id: "strip-reasoning-1",
    kind: "thinking",
    status: "completed",
    title: "Reasoning",
  },
  {
    createdAt: "2026-06-16T09:42:30.000Z",
    id: "strip-file-1",
    kind: "tool",
    payload: {
      itemType: "fileChange",
    },
    status: "completed",
    title: "File changes",
  },
  {
    createdAt: "2026-06-16T09:42:38.000Z",
    id: "strip-usage-1",
    kind: "usage",
    status: "completed",
    title: "Usage summary",
  },
  {
    createdAt: "2026-06-16T09:42:42.000Z",
    id: "strip-progress-1",
    kind: "progress",
    status: "running",
    title: "Tracing write path",
  },
];

const meta = {
  parameters: {
    layout: "padded",
  },
  title: "Molecules/Agent Chat",
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const RowsAndControls: Story = {
  render: () => {
    const [draft, setDraft] = React.useState<AgentChatQuestionDraft>({
      plan: ["Patch the failing projection and add a regression test"],
    });

    return (
      <div className="grid max-w-3xl gap-4">
        <AgentChatConnectionStatusBanner status="reconnecting" />
        <AgentChatThreadListItem
          onThreadDelete={() => undefined}
          selected
          thread={{
            activeTurnId: "turn-1",
            id: "thread-1",
            model: "gpt-5-codex",
            origin: {
              agentId: "codex",
              commentId: "comment-1",
              issueId: "ROB-10001",
              jobId: "job-1",
              kind: "issue-comment",
              repositoryId: "cycle",
              trigger: "agent-mention",
            },
            providerId: "codex",
            runtimeMode: "workspace-write",
            status: "waiting",
            summary: "Question pending before editing the projection path.",
            title: "Debug duplicate pending orders",
            unreadCount: 2,
            updatedAt: "2026-06-16T09:42:00.000Z",
          }}
        />
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <AgentChatProviderModelPicker
            model="gpt-5-codex"
            providerId="codex"
            providers={providers}
          />
          <AgentChatThinkingSelector
            providerId="codex"
            providers={providers}
            thinkingLevel="medium"
          />
          <AgentChatRuntimeModePicker runtimeMode="workspace-write" />
        </div>
        <AgentChatTurnStatusIndicator status="running" />
        <AgentChatMessageRow
          message={{
            createdAt: "2026-06-16T09:41:00.000Z",
            id: "message-1",
            role: "assistant",
            streaming: true,
            text: "I reproduced the failing spec and am tracing the lock boundary now.",
          }}
        />
        <AgentChatActivityRow
          activity={{
            createdAt: "2026-06-16T09:42:00.000Z",
            detail: "order_injection_concurrency.spec.ts failed on the duplicate merge assertion.",
            id: "activity-1",
            kind: "tool",
            payload: {
              command: "pnpm test order_injection_concurrency",
              duration: "18s",
            },
            status: "completed",
            title: "Ran regression test",
          }}
        />
        <AgentChatActivityStrip activities={activityStripItems} />
        <AgentChatApprovalCard
          activity={{
            createdAt: "2026-06-16T09:42:30.000Z",
            detail: "pnpm --filter @cycle/ui typecheck",
            id: "activity-approval-1",
            kind: "question",
            payload: {
              createdAt: "2026-06-16T09:42:30.000Z",
              defaultDecision: "decline",
              details: {
                command: "pnpm --filter @cycle/ui typecheck",
                cwd: "/Users/robertpitt/Projects/cycle",
              },
              kind: "command",
              requestId: "approval_123",
            },
            status: "pending",
            title: "Command approval requested",
          }}
          onDecision={() => undefined}
        />
        <AgentChatQuestionCard
          draft={draft}
          onDraftChange={(itemId, values) =>
            setDraft((current) => ({ ...current, [itemId]: values }))
          }
          question={{
            createdAt: "2026-06-16T09:43:00.000Z",
            id: "question-1",
            prompt: "Choose the next investigation path",
            questions: [
              {
                header: "Next step",
                id: "plan",
                multiSelect: false,
                options: [
                  {
                    description: "Smallest code change plus targeted coverage.",
                    label: "Patch the failing projection and add a regression test",
                  },
                  {
                    description: "Spend longer mapping adjacent order merge paths first.",
                    label: "Continue analysis before editing",
                  },
                ],
                question: "How should the agent proceed?",
              },
            ],
            status: "open",
            turnId: "turn-1",
          }}
        />
      </div>
    );
  },
};
