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
      activityEvents={[
        {
          author: {
            initials: "RP",
            name: "Robert Pitt",
          },
          body: "changed the status to In Progress",
          id: "status-change",
          occurredAt: "2026-06-11T10:30:00.000Z",
          timestamp: "11 Jun 2026, 10:30",
        },
        {
          author: {
            initials: "RP",
            name: "Robert Pitt",
          },
          body: "created the issue",
          id: "created",
          occurredAt: "2026-06-11T09:00:00.000Z",
          timestamp: "11 Jun 2026, 09:00",
        },
      ]}
      comments={[
        {
          author: {
            initials: "RP",
            name: "Robert Pitt",
          },
          body: "Added a repro case and linked the failing test output.",
          id: "comment-1",
          occurredAt: "2026-06-11T10:00:00.000Z",
          timestamp: "11 Jun 2026, 10:00",
        },
      ]}
    />
  ),
};

export const CollapsedSidebarSections: Story = {
  render: () => <ViewIssuePage propertiesDefaultOpen={false} />,
};
