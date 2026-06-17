import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import {
  AgentChatActivityRow,
  AgentChatConnectionStatusBanner,
  AgentChatMessageRow,
  AgentChatProviderModelPicker,
  AgentChatQuestionCard,
  AgentChatThinkingSelector,
  AgentChatThreadListItem,
  AgentChatTurnStatusIndicator,
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
          selected
          thread={{
            activeTurnId: "turn-1",
            id: "thread-1",
            model: "gpt-5-codex",
            providerId: "codex",
            status: "waiting",
            summary: "Question pending before editing the projection path.",
            title: "Debug duplicate pending orders",
            unreadCount: 2,
            updatedAt: "2026-06-16T09:42:00.000Z",
          }}
        />
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
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
        <AgentChatQuestionCard
          draft={draft}
          onDraftChange={(itemId, values) => setDraft((current) => ({ ...current, [itemId]: values }))}
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
