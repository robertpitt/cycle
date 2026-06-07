import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { WorkspaceVerifyDevicePage } from "./index.ts";

const meta = {
  parameters: {
    backgrounds: { disable: true },
    controls: { disable: true },
    layout: "fullscreen",
  },
  title: "Pages/Verify Device",
} satisfies Meta<typeof WorkspaceVerifyDevicePage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => React.createElement(WorkspaceVerifyDevicePage),
};
