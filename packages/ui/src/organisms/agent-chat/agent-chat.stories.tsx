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
  selectedThread: {
    activeTurnId: null,
    createdAt: "2026-06-16T08:30:00.000Z",
    id: "thread-debug",
    model: "gpt-5-codex",
    providerId: "codex",
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
        sequence: 2,
      },
      {
        id: "message-assistant-1",
        kind: "message",
        message: {
          createdAt: "2026-06-16T10:08:00.000Z",
          id: "message-assistant-1",
          role: "assistant",
          sequence: 3,
          text: "The failure reproduces locally. The smallest likely fix is in the pending order merge path.",
          turnId: "turn-debug-1",
        },
        sequence: 3,
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
