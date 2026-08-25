import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThemeProvider } from "../../theme/index.ts";
import { ViewIssue } from "./index.ts";

const meta = {
  component: ViewIssue,
  parameters: {
    docs: {
      description: {
        component:
          "Linear-style issue detail organism composed from editable text, issue editor, resource link, comment, sub-issue composer, and collapsible sidebar section molecules.",
      },
    },
  },
  title: "Organisms/View Issue",
} satisfies Meta<typeof ViewIssue>;

export default meta;

type Story = StoryObj<typeof meta>;

const renderIssue = (props?: React.ComponentProps<typeof ViewIssue>) => (
  <ThemeProvider mode="dark">
    <ViewIssue {...props} />
  </ThemeProvider>
);

export const Default: Story = {
  render: () => renderIssue(),
};

export const FormattingToolbarOpen: Story = {
  render: () =>
    renderIssue({
      descriptionToolbarOpen: true,
    }),
};

export const SlashMenuOpen: Story = {
  render: () =>
    renderIssue({
      descriptionSlashMenuOpen: true,
      description: "Test Issue Description /",
    }),
};

export const SubIssueComposerOpen: Story = {
  render: () =>
    renderIssue({
      defaultSubIssueComposerOpen: true,
    }),
};

export const WithComments: Story = {
  render: () =>
    renderIssue({
      comments: [
        {
          author: {
            initials: "RP",
            name: "Robert Pitt",
          },
          body: "TestComment",
          id: "comment-1",
          timestamp: "just now",
        },
      ],
    }),
};

export const CollaborationAndActions: Story = {
  render: () =>
    renderIssue({
      comments: [
        {
          author: { initials: "RP", name: "Robert Pitt" },
          body: "Can we preserve the existing API contract?",
          id: "comment-1",
          reactions: [{ active: true, count: 2, emoji: "👍" }],
          timestamp: "12m ago",
        },
        {
          author: { initials: "CA", name: "Cycle Agent" },
          body: "Yes — the mutation can remain append-only.",
          id: "comment-2",
          parentCommentId: "comment-1",
          timestamp: "8m ago",
        },
      ],
      dependencyState: {
        blocked: false,
        blockingTickets: [],
        dependencyTickets: [],
        downstreamBlockedTickets: [],
        downstreamTickets: [],
        relatedTickets: [],
        warnings: [],
      },
      labels: [{ id: "product", label: "Product" }],
      moreActions: [
        { id: "improve", label: "Improve with agent", onSelect: () => undefined },
        { id: "copy", label: "Copy issue ID", onSelect: () => undefined },
      ],
      onCommentArchive: () => undefined,
      onCommentEdit: () => undefined,
      onCommentReactionToggle: () => undefined,
      onCommentReply: () => undefined,
      onCopyIssueId: () => undefined,
      onCopyIssueLink: () => undefined,
      onLabelsEdit: () => undefined,
      onRelationshipsEdit: () => undefined,
      onResourceAdd: () => undefined,
      onResourceEdit: () => undefined,
      onResourceRemove: () => undefined,
      resources: [
        {
          description: "https://example.com/design",
          href: "https://example.com/design",
          id: "design",
          title: "Design brief",
        },
      ],
    }),
};
