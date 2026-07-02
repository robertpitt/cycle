import {
  Box,
  CalendarPlus,
  Circle,
  CircleCheck,
  CircleDashed,
  CircleOff,
  CircleUserRound,
  Link2,
  MoreHorizontal,
  Repeat2,
  Square,
  Tag,
} from "lucide-react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Avatar, AvatarFallback } from "../../atoms/avatar/index.ts";
import { ChipSelect, type ChipSelectSection } from "./index.ts";

const PriorityBars = ({ level }: { readonly level: 1 | 2 | 3 }) => (
  <span aria-hidden className="flex h-5 items-end gap-0.5 text-muted-foreground">
    {[1, 2, 3].map((bar) => (
      <span
        className={
          bar > level ? "w-1.5 rounded-sm bg-current opacity-35" : "w-1.5 rounded-sm bg-current"
        }
        key={bar}
        style={{
          height: `${bar * 5 + 4}px`,
        }}
      />
    ))}
  </span>
);

const LabelDot = ({ className }: { readonly className: string }) => (
  <span aria-hidden className={`size-3.5 rounded-full ${className}`} />
);

const statusSections: readonly ChipSelectSection[] = [
  {
    id: "status",
    options: [
      {
        icon: <CircleDashed aria-hidden className="size-5 animate-spin" />,
        id: "backlog",
        label: "Backlog",
        rightMeta: "1",
      },
      {
        icon: <Circle aria-hidden className="size-5" />,
        id: "todo",
        label: "Todo",
        rightMeta: "2",
        selected: true,
      },
      {
        icon: <Circle aria-hidden className="size-5 text-warning" />,
        id: "in-progress",
        label: "In Progress",
        rightMeta: "3",
      },
      {
        icon: <CircleCheck aria-hidden className="size-5 text-primary" />,
        id: "done",
        label: "Done",
        rightMeta: "4",
      },
      {
        icon: <CircleOff aria-hidden className="size-5" />,
        id: "canceled",
        label: "Canceled",
        rightMeta: "5",
      },
    ],
  },
];

const prioritySections: readonly ChipSelectSection[] = [
  {
    id: "priority",
    options: [
      {
        icon: <span className="font-semibold text-muted-foreground">--</span>,
        id: "none",
        label: "No priority",
        rightMeta: "0",
        selected: true,
      },
      {
        icon: (
          <span className="grid size-5 place-items-center rounded-sm bg-muted-foreground text-xs font-bold text-background">
            !
          </span>
        ),
        id: "urgent",
        label: "Urgent",
        rightMeta: "1",
      },
      {
        icon: <PriorityBars level={3} />,
        id: "high",
        label: "High",
        rightMeta: "2",
      },
      {
        icon: <PriorityBars level={2} />,
        id: "medium",
        label: "Medium",
        rightMeta: "3",
      },
      {
        icon: <PriorityBars level={1} />,
        id: "low",
        label: "Low",
        rightMeta: "4",
      },
    ],
  },
];

const assigneeSections: readonly ChipSelectSection[] = [
  {
    id: "assignee",
    options: [
      {
        icon: <CircleUserRound aria-hidden className="size-5" />,
        id: "none",
        label: "No assignee",
        rightMeta: "0",
        selected: true,
      },
      {
        icon: (
          <Avatar className="size-6">
            <AvatarFallback className="text-[10px]">RP</AvatarFallback>
          </Avatar>
        ),
        id: "robert-pitt",
        label: "Robert Pitt",
        rightMeta: "1",
      },
    ],
  },
];

const projectSections: readonly ChipSelectSection[] = [
  {
    id: "project",
    label: "Projects in Robert-pitt t...",
    options: [
      {
        icon: <CircleDashed aria-hidden className="size-5" />,
        id: "none",
        label: "No project",
        rightMeta: "0",
        selected: true,
      },
      {
        icon: <Box aria-hidden className="size-5" />,
        id: "test",
        label: "test",
      },
    ],
  },
];

const labelSections: readonly ChipSelectSection[] = [
  {
    id: "labels",
    options: [
      {
        icon: <LabelDot className="bg-destructive" />,
        id: "bug",
        label: "Bug",
      },
      {
        icon: <LabelDot className="bg-primary" />,
        id: "feature",
        label: "Feature",
      },
      {
        icon: <LabelDot className="bg-blue-400" />,
        id: "improvement",
        label: "Improvement",
      },
    ],
  },
];

const moreSections: readonly ChipSelectSection[] = [
  {
    id: "schedule",
    options: [
      {
        icon: <CalendarPlus aria-hidden className="size-5" />,
        id: "due-date",
        label: "Set due date",
        rightMeta: "⇧ D  ›",
      },
      {
        icon: <Repeat2 aria-hidden className="size-5" />,
        id: "recurring",
        label: "Make recurring...",
      },
      {
        icon: <Link2 aria-hidden className="size-5" />,
        id: "link",
        label: "Add link...",
        rightMeta: "Ctrl L",
      },
    ],
  },
  {
    id: "create",
    options: [
      {
        icon: <Box aria-hidden className="size-5" />,
        id: "sub-issue",
        label: "Add sub-issue",
        rightMeta: "⌘ ⇧ O",
      },
    ],
  },
];

const ticketTypeSections: readonly ChipSelectSection[] = [
  {
    id: "type",
    options: [
      {
        icon: <Square aria-hidden className="size-4" />,
        id: "auto",
        label: "Auto",
        rightMeta: "Let the agent choose; manual create defaults to task",
        selected: true,
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
    sections: [],
    triggerLabel: "Chip",
  },
  component: ChipSelect,
  parameters: {
    controls: {
      disable: true,
    },
  },
  title: "Molecules/Chip Select",
} satisfies Meta<typeof ChipSelect>;

export default meta;

type Story = StoryObj<typeof meta>;

const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div className="min-h-[360px] p-4">{children}</div>
);

export const StatusOpen: Story = {
  render: () => (
    <Frame>
      <ChipSelect
        defaultOpen
        searchPlaceholder="Change status..."
        searchShortcut="S"
        sections={statusSections}
        triggerActive
        triggerIcon={<Circle aria-hidden className="size-4" />}
        triggerLabel="Todo"
        widthClassName="w-[414px]"
      />
    </Frame>
  ),
};

export const PriorityOpen: Story = {
  render: () => (
    <Frame>
      <ChipSelect
        defaultOpen
        searchPlaceholder="Set priority to..."
        searchShortcut="P"
        sections={prioritySections}
        triggerIcon={<span className="font-semibold leading-none">---</span>}
        triggerLabel="Priority"
        widthClassName="w-[414px]"
      />
    </Frame>
  ),
};

export const AssigneeOpen: Story = {
  render: () => (
    <Frame>
      <ChipSelect
        defaultOpen
        sections={assigneeSections}
        triggerIcon={<CircleUserRound aria-hidden className="size-4" />}
        triggerLabel="Assignee"
        widthClassName="w-[350px]"
      />
    </Frame>
  ),
};

export const ProjectOpen: Story = {
  render: () => (
    <Frame>
      <ChipSelect
        defaultOpen
        sections={projectSections}
        triggerIcon={<Box aria-hidden className="size-4" />}
        triggerLabel="Project"
        widthClassName="w-[350px]"
      />
    </Frame>
  ),
};

export const LabelsOpen: Story = {
  render: () => (
    <Frame>
      <ChipSelect
        defaultOpen
        searchPlaceholder="Add labels..."
        searchShortcut="L"
        sections={labelSections}
        triggerIcon={<Tag aria-hidden className="size-4" />}
        triggerLabel="Labels"
        widthClassName="w-[414px]"
      />
    </Frame>
  ),
};

export const MoreOpen: Story = {
  render: () => (
    <Frame>
      <ChipSelect
        defaultOpen
        sections={moreSections}
        triggerIcon={<MoreHorizontal aria-hidden className="size-4" />}
        triggerLabel={<span className="sr-only">More issue properties</span>}
        triggerLabelText="More issue properties"
        widthClassName="w-[384px]"
      />
    </Frame>
  ),
};

export const LongMetadataOpen: Story = {
  render: () => (
    <div className="min-h-[620px] p-4">
      <ChipSelect
        defaultOpen
        searchPlaceholder="Choose type..."
        sections={ticketTypeSections}
        triggerActive
        triggerIcon={<Square aria-hidden className="size-4" />}
        triggerLabel="Auto"
        widthClassName="w-[350px]"
      />
    </div>
  ),
};
