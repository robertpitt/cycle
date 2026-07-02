import type { Meta, StoryObj } from "@storybook/react-vite";
import { Circle, CircleCheck, CircleDashed, Square, Tag, UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "../../atoms/avatar/index.ts";
import { PropertyPicker, type PropertyPickerSection } from "./index.ts";

const statusSections: readonly PropertyPickerSection[] = [
  {
    id: "status",
    options: [
      {
        icon: <CircleDashed aria-hidden className="size-5" />,
        id: "backlog",
        label: "Backlog",
        rightMeta: "1",
      },
      {
        icon: <Circle aria-hidden className="size-5" />,
        id: "todo",
        label: "Todo",
        rightMeta: "2",
      },
      {
        icon: <Circle aria-hidden className="size-5 text-warning" />,
        id: "in-progress",
        label: "In progress",
        rightMeta: "3",
      },
      {
        icon: <CircleCheck aria-hidden className="size-5 text-primary" />,
        id: "done",
        label: "Done",
        rightMeta: "4",
      },
    ],
  },
];

const labelSections: readonly PropertyPickerSection[] = [
  {
    id: "labels",
    options: [
      {
        icon: <span aria-hidden className="size-3.5 rounded-full bg-destructive" />,
        id: "bug",
        label: "Bug",
      },
      {
        icon: <span aria-hidden className="size-3.5 rounded-full bg-primary" />,
        id: "feature",
        label: "Feature",
      },
      {
        icon: <span aria-hidden className="size-3.5 rounded-full bg-success" />,
        id: "improvement",
        label: "Improvement",
      },
    ],
  },
];

const assigneeSections: readonly PropertyPickerSection[] = [
  {
    id: "assignee",
    options: [
      {
        icon: <UserRound aria-hidden className="size-5" />,
        id: "none",
        label: "No assignee",
      },
      {
        icon: (
          <Avatar className="size-6">
            <AvatarFallback className="text-[10px]">RP</AvatarFallback>
          </Avatar>
        ),
        id: "robert-pitt",
        label: "Robert Pitt",
      },
      {
        disabled: true,
        icon: (
          <Avatar className="size-6">
            <AvatarFallback className="text-[10px]">AL</AvatarFallback>
          </Avatar>
        ),
        id: "alex-lane",
        label: "Alex Lane",
      },
    ],
  },
];

const ticketTypeSections: readonly PropertyPickerSection[] = [
  {
    id: "type",
    options: [
      {
        icon: <Square aria-hidden className="size-4" />,
        id: "auto",
        label: "Auto",
        rightMeta: "Let the agent choose; manual create defaults to task",
      },
      {
        icon: <Square aria-hidden className="size-4" />,
        id: "epic",
        label: "Epic",
        rightMeta: "Large outcome or parent workstream",
      },
      {
        icon: <Square aria-hidden className="size-4" />,
        id: "feature",
        label: "Feature",
        rightMeta: "New user-facing capability",
      },
      {
        icon: <Square aria-hidden className="size-4" />,
        id: "story",
        label: "Story",
        rightMeta: "User workflow or product behavior slice",
      },
      {
        icon: <Square aria-hidden className="size-4" />,
        id: "bug",
        label: "Bug",
        rightMeta: "Incorrect behavior or regression",
      },
      {
        icon: <Square aria-hidden className="size-4" />,
        id: "task",
        label: "Task",
        rightMeta: "Implementation or maintenance work",
      },
      {
        icon: <Square aria-hidden className="size-4" />,
        id: "spec",
        label: "Spec",
        rightMeta: "Requirements, contracts, or implementation spec",
      },
    ],
  },
];

const meta = {
  args: {
    placeholder: "Status",
    searchPlaceholder: "Change status...",
    searchShortcut: "S",
    sections: statusSections,
    triggerIcon: <Circle aria-hidden className="size-4" />,
    value: "todo",
    widthClassName: "w-[360px]",
  },
  component: PropertyPicker,
  parameters: {
    controls: {
      disable: true,
    },
  },
  title: "Molecules/Property Picker",
} satisfies Meta<typeof PropertyPicker>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SingleValue: Story = {};

export const MultiValue: Story = {
  args: {
    defaultOpen: true,
    multiple: true,
    placeholder: "Labels",
    sections: labelSections,
    triggerIcon: <Tag aria-hidden className="size-4" />,
    value: ["bug", "feature"],
  },
};

export const Empty: Story = {
  args: {
    placeholder: "Assignee",
    sections: assigneeSections,
    triggerIcon: <UserRound aria-hidden className="size-4" />,
    value: null,
    widthClassName: "w-[320px]",
  },
};

export const DisabledOption: Story = {
  args: {
    defaultOpen: true,
    placeholder: "Assignee",
    sections: assigneeSections,
    triggerIcon: <UserRound aria-hidden className="size-4" />,
    value: "robert-pitt",
    widthClassName: "w-[320px]",
  },
};

export const CustomLabel: Story = {
  args: {
    formatValueLabel: (selectedOptions) =>
      selectedOptions.length === 0 ? "Labels" : `${selectedOptions.length} selected`,
    multiple: true,
    placeholder: "Labels",
    sections: labelSections,
    triggerIcon: <Tag aria-hidden className="size-4" />,
    value: ["bug", "feature", "improvement"],
  },
};

export const LongMetadata: Story = {
  args: {
    defaultOpen: true,
    placeholder: "Type",
    searchPlaceholder: "Choose type...",
    sections: ticketTypeSections,
    triggerIcon: <Square aria-hidden className="size-4" />,
    value: "auto",
    widthClassName: "w-[350px]",
  },
};
