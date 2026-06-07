import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { WorkspaceJoinPage } from "./index.ts";

const meta = {
  parameters: {
    backgrounds: { disable: true },
    controls: { disable: true },
    layout: "fullscreen",
  },
  title: "Pages/Join Workspace",
} satisfies Meta<typeof WorkspaceJoinPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => React.createElement(WorkspaceJoinPage),
};
