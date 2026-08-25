import type { Meta, StoryObj } from "@storybook/react-vite";
import { IssuesBoard } from "./issues-board.tsx";

const meta = {
  component: IssuesBoard,
  title: "Organisms/Issues Board",
} satisfies Meta<typeof IssuesBoard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    columns: [
      {
        id: "todo",
        rows: [
          {
            id: "CYC-101",
            meta: [{ label: "feature" }],
            title: "Add explicit issue sorting",
          },
        ],
        title: "Todo",
      },
      {
        id: "in-progress",
        rows: [
          {
            id: "CYC-102",
            meta: [{ label: "desktop", tone: "success" }],
            title: "Build repository sync history",
          },
        ],
        title: "In progress",
      },
    ],
  },
};
