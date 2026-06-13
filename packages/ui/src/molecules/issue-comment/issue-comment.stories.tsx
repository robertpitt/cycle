import type { Meta, StoryObj } from "@storybook/react-vite";
import { IssueActivityEvent, IssueCommentCard, IssueCommentComposer } from "./index.ts";
import type { MarkdownEditorTagSuggestion } from "../markdown-editor/index.ts";

const author = {
  initials: "RP",
  name: "Robert Pitt",
};

const tagSuggestions: readonly MarkdownEditorTagSuggestion[] = [
  {
    description: "Renderer slash menu clipping",
    id: "ROB-10001",
    kind: "issue",
    label: "#ROB-10001",
  },
  {
    description: "Local implementation agent",
    id: "codex",
    kind: "agent",
    label: "Codex",
  },
  {
    description: "Workspace owner",
    id: "robert",
    kind: "user",
    label: "Robert Pitt",
  },
];

const meta = {
  component: IssueCommentComposer,
  title: "Molecules/Issue Comment",
} satisfies Meta<typeof IssueCommentComposer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ActivityAndComposer: Story = {
  render: () => (
    <div className="grid max-w-3xl gap-5 rounded-lg border border-border bg-background p-6">
      <IssueActivityEvent author={author} timestamp="6d ago">
        created the issue
      </IssueActivityEvent>
      <IssueCommentCard
        author={author}
        body={"Comment body with **Markdown** and a task:\n\n- [x] Render safely"}
        timestamp="just now"
      />
      <IssueCommentComposer author={author} tagSuggestions={tagSuggestions} />
    </div>
  ),
};
