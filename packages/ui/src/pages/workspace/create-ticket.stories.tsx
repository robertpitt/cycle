import type { Meta, StoryObj } from "@storybook/react-vite";
import { WorkspaceCreateTicketPage } from "./index.ts";

const meta = {
  parameters: {
    backgrounds: {
      disable: true,
    },
    controls: {
      disable: true,
    },
    layout: "fullscreen",
  },
  title: "Examples/Create Ticket",
} satisfies Meta<typeof WorkspaceCreateTicketPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <WorkspaceCreateTicketPage />,
};
