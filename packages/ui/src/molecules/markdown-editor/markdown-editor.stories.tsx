import type { Meta, StoryObj } from "@storybook/react-vite";
import { MarkdownEditor, MarkdownEditorSlashMenu, MarkdownEditorToolbar } from "./index.ts";

const sampleMarkdown = `## Reconcile local draft state

Track #ROB-10001 while preserving Markdown output.

- [x] Import existing ticket body
- [ ] Export comment Markdown
- [ ] Keep desktop mutations string-based

> The editor owns interaction; the app owns persistence.

\`\`\`ts
const bodyFormat = "markdown";
\`\`\`
`;

const meta = {
  component: MarkdownEditor,
  title: "Molecules/Markdown Editor",
} satisfies Meta<typeof MarkdownEditor>;

export default meta;

type Story = StoryObj<typeof meta>;

export const TicketEditor: Story = {
  render: () => (
    <div className="max-w-3xl rounded-lg border border-border bg-background p-8">
      <MarkdownEditor defaultValue={sampleMarkdown} placeholder="Add description..." />
    </div>
  ),
};

export const CommentInput: Story = {
  render: () => (
    <div className="max-w-2xl rounded-lg border border-border bg-elevated p-4">
      <MarkdownEditor
        contentClassName="px-1 py-1"
        editorClassName="border-transparent hover:bg-transparent focus-within:border-transparent focus-within:bg-transparent"
        minHeightClassName="min-h-20"
        mode="comment"
        placeholder="Leave a comment..."
      />
    </div>
  ),
};

export const Preview: Story = {
  render: () => (
    <div className="max-w-3xl rounded-lg border border-border bg-background p-8">
      <MarkdownEditor defaultPreviewOpen defaultValue={sampleMarkdown} />
    </div>
  ),
};

export const ToolbarAndSlashMenu: Story = {
  render: () => (
    <div className="grid max-w-3xl gap-4 rounded-lg border border-border bg-background p-8">
      <MarkdownEditorToolbar />
      <MarkdownEditorSlashMenu />
      <MarkdownEditor defaultValue="Type / to insert a block or select text to format it." />
    </div>
  ),
};
