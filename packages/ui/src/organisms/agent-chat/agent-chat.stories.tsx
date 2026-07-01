import type { Meta, StoryObj } from "@storybook/react-vite";
import { AgentChatShell, type AgentChatShellProps } from "./index.ts";

const meta = {
  component: AgentChatShell,
  parameters: {
    layout: "fullscreen",
  },
  title: "Organisms/Agent Chat",
} satisfies Meta<typeof AgentChatShell>;

export default meta;

type Story = StoryObj<typeof meta>;

const shellArgs: AgentChatShellProps = {
  connectionStatus: "connected",
  model: "gpt-5-codex",
  providerId: "codex",
  providers: [
    {
      defaultModel: "gpt-5-codex",
      id: "codex",
      label: "Codex",
      models: [{ id: "gpt-5-codex", label: "GPT-5 Codex" }],
      thinkingLevels: [{ id: "medium", label: "Medium" }],
    },
  ],
  relativeBase: "2026-06-16T10:20:00.000Z",
  runtimeMode: "workspace-write",
  selectedThread: {
    activeTurnId: null,
    createdAt: "2026-06-16T08:30:00.000Z",
    id: "thread-debug",
    model: "gpt-5-codex",
    providerId: "codex",
    runtimeMode: "workspace-write",
    status: "active",
    summary: "Trace the order merge regression and propose the smallest fix.",
    thinkingLevel: "medium",
    timeline: [
      {
        id: "message-user-1",
        kind: "message",
        message: {
          createdAt: "2026-06-16T10:00:00.000Z",
          id: "message-user-1",
          role: "user",
          sequence: 1,
          text: "Can you investigate why the order concurrency spec is failing?",
          turnId: null,
        },
        sequence: 1,
      },
      {
        id: "message-assistant-1",
        kind: "message",
        message: {
          createdAt: "2026-06-16T10:01:00.000Z",
          id: "message-assistant-1",
          role: "assistant",
          sequence: 2,
          text: "I'll reproduce the failing spec first, then inspect the merge path that owns pending orders.",
          turnId: "turn-debug-1",
        },
        sequence: 2,
      },
      {
        activity: {
          createdAt: "2026-06-16T10:03:00.000Z",
          detail: "Reproduced the duplicate pending order assertion locally.",
          id: "activity-tool-1",
          kind: "tool",
          payload: { command: "pnpm test order_injection_concurrency", exitCode: 1 },
          status: "completed",
          title: "Ran targeted test",
        },
        id: "activity-tool-1",
        kind: "activity",
        sequence: 3,
      },
      {
        id: "message-assistant-2",
        kind: "message",
        message: {
          createdAt: "2026-06-16T10:08:00.000Z",
          id: "message-assistant-2",
          role: "assistant",
          sequence: 4,
          text: "The failure reproduces locally. The smallest likely fix is in the pending order merge path.",
          turnId: "turn-debug-1",
        },
        sequence: 4,
      },
      {
        activity: {
          createdAt: "2026-06-16T10:09:00.000Z",
          detail: "src/orders/pending-order-merge.ts",
          id: "activity-read-1",
          kind: "tool",
          payload: { itemType: "mcpToolCall", namespace: "repo", tool: "read_file" },
          status: "completed",
          title: "Tool call",
        },
        id: "activity-read-1",
        kind: "activity",
        sequence: 5,
      },
      {
        activity: {
          createdAt: "2026-06-16T10:09:30.000Z",
          detail: "pending order duplicate merge",
          id: "activity-search-1",
          kind: "tool",
          payload: { itemType: "webSearch" },
          status: "completed",
          title: "Web search",
        },
        id: "activity-search-1",
        kind: "activity",
        sequence: 6,
      },
      {
        id: "message-assistant-3",
        kind: "message",
        message: {
          createdAt: "2026-06-16T10:10:00.000Z",
          id: "message-assistant-3",
          role: "assistant",
          sequence: 7,
          text: "The merge keeps stale pending entries when the retry path replays the same external order id. I'm checking the shared guard before editing it.",
          turnId: "turn-debug-1",
        },
        sequence: 7,
      },
    ],
    title: "Debug duplicate pending orders",
    turnStatus: "completed",
    updatedAt: "2026-06-16T10:12:00.000Z",
  },
  selectedThreadId: "thread-debug",
  thinkingLevel: "medium",
  threads: [
    {
      activeTurnId: null,
      createdAt: "2026-06-16T08:30:00.000Z",
      id: "thread-debug",
      model: "gpt-5-codex",
      providerId: "codex",
      runtimeMode: "workspace-write",
      status: "active",
      summary: "Trace the order merge regression and propose the smallest fix.",
      thinkingLevel: "medium",
      title: "Debug duplicate pending orders",
      updatedAt: "2026-06-16T10:12:00.000Z",
    },
  ],
};

export const Shell: Story = {
  args: shellArgs,
  render: (args) => (
    <div className="h-screen bg-background p-4">
      <AgentChatShell {...args} />
    </div>
  ),
};
