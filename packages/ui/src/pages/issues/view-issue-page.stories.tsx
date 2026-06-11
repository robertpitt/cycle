import type { Meta, StoryObj } from "@storybook/react-vite";
import { ViewIssuePage, viewIssueComponentBreakdown } from "./view-issue/index.ts";

const meta = {
  component: ViewIssuePage,
  parameters: {
    docs: {
      description: {
        component: `Breakdown:

Atoms: ${viewIssueComponentBreakdown.atoms.join(", ")}

Molecules: ${viewIssueComponentBreakdown.molecules.join(", ")}

Organism: ${viewIssueComponentBreakdown.organisms.join(", ")}`,
      },
    },
    layout: "fullscreen",
  },
  title: "Examples/View Issue Page",
} satisfies Meta<typeof ViewIssuePage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <ViewIssuePage />,
};

export const SelectionToolbar: Story = {
  render: () => <ViewIssuePage descriptionToolbarOpen />,
};

export const SlashCommandMenu: Story = {
  render: () => <ViewIssuePage description="Test Issue Description /" descriptionSlashMenuOpen />,
};

export const InlineSubIssueComposer: Story = {
  render: () => <ViewIssuePage defaultSubIssueComposerOpen />,
};

export const ActivityWithComments: Story = {
  render: () => (
    <ViewIssuePage
      comments={[
        {
          author: {
            initials: "RP",
            name: "Robert Pitt",
          },
          body: "TestComment",
          id: "comment-1",
          timestamp: "just now",
        },
      ]}
    />
  ),
};

export const CollapsedSidebarSections: Story = {
  render: () => <ViewIssuePage propertiesDefaultOpen={false} />,
};
