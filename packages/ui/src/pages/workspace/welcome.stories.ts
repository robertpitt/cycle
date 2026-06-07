import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { WorkspaceWelcomePage } from "./index.ts";

const meta = {
  parameters: {
    backgrounds: { disable: true },
    controls: { disable: true },
    layout: "fullscreen",
  },
  title: "Pages/Welcome",
} satisfies Meta<typeof WorkspaceWelcomePage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => React.createElement(WorkspaceWelcomePage),
};
