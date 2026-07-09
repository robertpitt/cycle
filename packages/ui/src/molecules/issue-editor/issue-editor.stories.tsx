import type { Meta, StoryObj } from "@storybook/react-vite";
import { IssueEditor, IssueEditorSlashMenu, IssueEditorToolbar } from "./index.ts";

const meta = {
  component: IssueEditor,
  title: "Molecules/Issue Editor",
} satisfies Meta<typeof IssueEditor>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="max-w-3xl rounded-lg border border-border bg-background p-8">
      <IssueEditor
        defaultValue={"## Test Issue Description\n\n- [ ] Render Markdown\n- [ ] Preserve syntax"}
        onAttach={() => undefined}
        onMention={() => undefined}
      />
    </div>
  ),
};

export const Preview: Story = {
  render: () => (
    <div className="max-w-3xl rounded-lg border border-border bg-background p-8">
      <IssueEditor
        defaultPreviewOpen
        defaultValue={"## Preview body\n\n| Field | Value |\n| --- | --- |\n| Status | Todo |"}
      />
    </div>
  ),
};

export const FormattingToolbar: Story = {
  render: () => (
    <div className="grid gap-4 rounded-lg border border-border bg-background p-8">
      <IssueEditorToolbar />
      <IssueEditor defaultValue="Select text to open this toolbar in the full page example." />
    </div>
  ),
};

export const SlashMenu: Story = {
  render: () => (
    <div className="grid gap-4 rounded-lg border border-border bg-background p-8">
      <IssueEditorSlashMenu />
      <IssueEditor defaultValue="Type / to open command suggestions." />
    </div>
  ),
};
