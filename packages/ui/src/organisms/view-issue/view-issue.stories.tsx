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
