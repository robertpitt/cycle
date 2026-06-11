import type { Meta, StoryObj } from "@storybook/react-vite";
import { IssueActivityEvent, IssueCommentCard, IssueCommentComposer } from "./index.ts";

const author = {
  initials: "RP",
  name: "Robert Pitt",
};

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
      <IssueCommentComposer author={author} />
    </div>
  ),
};
