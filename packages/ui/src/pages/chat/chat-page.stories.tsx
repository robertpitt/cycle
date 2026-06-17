import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChatPage } from "./index.ts";
import { createAgentChatFixture, withQuestionDraft } from "./chat-page.fixtures.ts";

const meta = {
  component: ChatPage,
  parameters: {
    backgrounds: {
      disable: true,
    },
    controls: {
      disable: true,
    },
    layout: "fullscreen",
  },
  title: "Examples/Chat",
} satisfies Meta<typeof ChatPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const EmptyChat: Story = {
  args: createAgentChatFixture("empty"),
};

export const StreamingAssistantText: Story = {
  args: createAgentChatFixture("streaming"),
};

export const StructuredActivity: Story = {
  args: createAgentChatFixture("activity"),
};

export const PendingSingleChoiceQuestion: Story = {
  args: withQuestionDraft(createAgentChatFixture("single-question")),
};

export const PendingMultiChoiceQuestion: Story = {
  args: withQuestionDraft(createAgentChatFixture("multi-question")),
};

export const FailedTurn: Story = {
  args: createAgentChatFixture("failed"),
};

export const CancelledTurn: Story = {
  args: createAgentChatFixture("cancelled"),
};

export const DisconnectedReconnecting: Story = {
  args: createAgentChatFixture("disconnected"),
};

export const MultipleActiveThreads: Story = {
  args: createAgentChatFixture("multiple-active"),
};

export const ProviderModelThinkingControls: Story = {
  args: createAgentChatFixture("provider-controls"),
};
