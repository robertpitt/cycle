import type { Meta, StoryObj } from "@storybook/react-vite";
import { MarkdownRenderer } from "./index.ts";

const markdown = `# Issue body

Track delivery for #iss_story_0001 with **bold**, _italic_, ~~removed~~, and a safe link to https://example.com.

- [x] Database projection
- [ ] Desktop bridge
- [ ] Renderer states

| Field | Value |
| --- | --- |
| Priority | High |
| Estimate | 3 |

> Notes stay readable in activity streams.

\`\`\`ts
const status = "ready";
\`\`\`

<script>alert("raw html is not rendered")</script>
`;

const meta = {
  component: MarkdownRenderer,
  title: "Components/Markdown Renderer",
} satisfies Meta<typeof MarkdownRenderer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    markdown,
  },
  render: (args) => (
    <div className="max-w-3xl rounded-lg border border-border bg-background p-6">
      <MarkdownRenderer {...args} />
    </div>
  ),
};
