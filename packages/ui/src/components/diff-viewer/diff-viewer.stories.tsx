import type { Meta, StoryObj } from "@storybook/react-vite";
import { DiffViewer } from "./index.ts";

const files = [
  {
    language: "markdown",
    newContent:
      "# Issue\n\nUpdated body with a task list.\n\n- [x] Write database tests\n- [ ] Ship UI",
    newPath: "iss_story_0001.md",
    oldContent: "# Issue\n\nOriginal body.\n\n- [ ] Write database tests",
    oldPath: "iss_story_0001.md",
  },
];

const meta = {
  component: DiffViewer,
  title: "Components/Diff Viewer",
} satisfies Meta<typeof DiffViewer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Unified: Story = {
  args: {
    files,
    mode: "unified",
  },
  render: (args) => (
    <div className="max-w-4xl rounded-lg border border-border bg-background p-6">
      <DiffViewer {...args} />
    </div>
  ),
};

export const Split: Story = {
  args: {
    files,
    mode: "split",
  },
  render: Unified.render,
};

export const Empty: Story = {
  args: {
    files: [],
  },
  render: Unified.render,
};

export const TooLarge: Story = {
  args: {
    files,
    maxContentLength: 20,
  },
  render: Unified.render,
};
