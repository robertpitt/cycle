import type { Meta, StoryObj } from "@storybook/react-vite";
import { AgentChatShell } from "./index.ts";
import { createAgentChatFixture, withQuestionDraft } from "../../pages/chat/chat-page.fixtures.ts";

const meta = {
  component: AgentChatShell,
  parameters: {
    layout: "fullscreen",
  },
  title: "Organisms/Agent Chat",
} satisfies Meta<typeof AgentChatShell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Shell: Story = {
  args: withQuestionDraft(createAgentChatFixture("activity")),
  render: (args) => (
    <div className="h-screen bg-background p-4">
      <AgentChatShell {...args} />
    </div>
  ),
};
