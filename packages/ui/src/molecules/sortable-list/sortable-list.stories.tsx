import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { SortableList, type SortableListItem } from "./index.ts";

const initialItems: readonly SortableListItem[] = [
  {
    content: "Wire repository status into the sidebar",
    id: "STY-00001",
  },
  {
    content: "Render Markdown comments",
    id: "STY-00002",
  },
  {
    content: "Persist sub-issue ordering",
    id: "STY-00003",
  },
];

const meta = {
  component: SortableList,
  title: "Molecules/Sortable List",
} satisfies Meta<typeof SortableList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    items: initialItems,
  },
  render: () => {
    const [items, setItems] = React.useState(initialItems);

    return (
      <div className="max-w-xl rounded-lg border border-border bg-background p-6">
        <SortableList
          items={items}
          onOrderChange={(nextIds) => {
            const byId = new Map(items.map((item) => [item.id, item]));
            setItems(nextIds.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : [])));
          }}
        />
      </div>
    );
  },
};
