import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { WorkspaceCreateOrImportPage } from "./index.ts";

const meta = {
  parameters: {
    backgrounds: { disable: true },
    controls: { disable: true },
    layout: "fullscreen",
  },
  title: "Pages/Create or Import Workspace",
} satisfies Meta<typeof WorkspaceCreateOrImportPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => React.createElement(WorkspaceCreateOrImportPage),
};
