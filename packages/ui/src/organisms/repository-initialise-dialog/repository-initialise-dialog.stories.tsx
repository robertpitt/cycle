import type { Meta, StoryObj } from "@storybook/react-vite";
import { RepositoryInitialiseDialog } from "./index.ts";

const noop = () => undefined;

const meta = {
  args: {
    onCancel: noop,
    onChooseFolder: noop,
    onInitialise: noop,
    path: "/Users/robertpitt/Projects/cycle",
  },
  component: RepositoryInitialiseDialog,
  parameters: {
    controls: {
      disable: true,
    },
  },
  title: "Organisms/Repository Initialise Dialog",
} satisfies Meta<typeof RepositoryInitialiseDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <div className="relative min-h-[520px] overflow-hidden rounded-lg border border-border bg-background">
      <RepositoryInitialiseDialog {...args} className="absolute" />
    </div>
  ),
};

export const Saving: Story = {
  render: (args) => (
    <div className="relative min-h-[520px] overflow-hidden rounded-lg border border-border bg-background">
      <RepositoryInitialiseDialog {...args} className="absolute" saving />
    </div>
  ),
};

export const Error: Story = {
  render: (args) => (
    <div className="relative min-h-[520px] overflow-hidden rounded-lg border border-border bg-background">
      <RepositoryInitialiseDialog
        {...args}
        className="absolute"
        error="Unable to initialise this folder. Check permissions and try again."
      />
    </div>
  ),
};

export const WithoutFolderAction: Story = {
  render: (args) => {
    const dialogProps = { ...args };
    delete dialogProps.onChooseFolder;

    return (
      <div className="relative min-h-[520px] overflow-hidden rounded-lg border border-border bg-background">
        <RepositoryInitialiseDialog {...dialogProps} className="absolute" />
      </div>
    );
  },
};
