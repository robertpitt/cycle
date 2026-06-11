import { Avatar, AvatarFallback } from "@cycle/ui/atoms";
import type { PropertyPickerSection } from "@cycle/ui/components/property-picker";
import { cn } from "@cycle/ui/utils";
import {
  Box,
  CalendarPlus,
  Circle,
  CircleCheck,
  CircleDashed,
  CircleOff,
  CircleUserRound,
  Link2,
  Repeat2,
} from "lucide-react";
import type { ProfileConfig, RepositoryRecord } from "../../../shared/AppConfig.ts";

export type CreateIssueDialogOptionSections = {
  readonly assigneeSections: readonly PropertyPickerSection[];
  readonly labelSections: readonly PropertyPickerSection[];
  readonly moreSections: readonly PropertyPickerSection[];
  readonly prioritySections: readonly PropertyPickerSection[];
  readonly projectSections: readonly PropertyPickerSection[];
  readonly statusSections: readonly PropertyPickerSection[];
};

const initialsForName = (name: string): string =>
  name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

const PriorityBars = ({ level }: { readonly level: 1 | 2 | 3 }) => (
  <span aria-hidden className="flex h-5 items-end gap-0.5 text-muted-foreground">
    {[1, 2, 3].map((bar) => (
      <span
        className="w-1.5 rounded-sm bg-current data-[muted=true]:opacity-35"
        data-muted={bar > level}
        key={bar}
        style={{
          height: `${bar * 5 + 4}px`,
        }}
      />
    ))}
  </span>
);

const LabelDot = ({ className }: { readonly className: string }) => (
  <span aria-hidden className={cn("size-3.5 rounded-full", className)} />
);

const createAssigneeSections = (profile?: ProfileConfig): readonly PropertyPickerSection[] => {
  const displayName = profile?.displayName.trim();
  const userOption =
    displayName && displayName.length > 0
      ? [
          {
            icon: (
              <Avatar className="size-6">
                <AvatarFallback className="text-[10px]">
                  {initialsForName(displayName)}
                </AvatarFallback>
              </Avatar>
            ),
            id: displayName,
            label: displayName,
            rightMeta: "1",
          },
        ]
      : [];

  return [
    {
      id: "assignee",
      options: [
        {
          icon: <CircleUserRound aria-hidden className="size-5" strokeWidth={2} />,
          id: "none",
          label: "No assignee",
          rightMeta: "0",
        },
        ...userOption,
      ],
    },
  ];
};

const createProjectSections = (repository?: RepositoryRecord): readonly PropertyPickerSection[] => [
  {
    id: "repository",
    label: repository ? `Projects in ${repository.displayName}` : "Projects",
    options: [
      {
        icon: <CircleDashed aria-hidden className="size-5" strokeWidth={2.2} />,
        id: "none",
        label: "No project",
        rightMeta: "0",
      },
      ...(repository
        ? [
            {
              icon: <Box aria-hidden className="size-5" strokeWidth={2} />,
              id: repository.id,
              label: repository.displayName,
            },
          ]
        : []),
    ],
  },
];

export const createIssueDialogOptionSections = ({
  profile,
  repository,
}: {
  readonly profile?: ProfileConfig;
  readonly repository?: RepositoryRecord;
}): CreateIssueDialogOptionSections => ({
  assigneeSections: createAssigneeSections(profile),
  labelSections: [
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
          icon: <LabelDot className="bg-success" />,
          id: "improvement",
          label: "Improvement",
        },
      ],
    },
  ],
  moreSections: [
    {
      id: "schedule",
      options: [
        {
          icon: <CalendarPlus aria-hidden className="size-5" strokeWidth={2} />,
          id: "due-date",
          label: "Set due date",
        },
        {
          icon: <Repeat2 aria-hidden className="size-5" strokeWidth={2} />,
          id: "recurring",
          label: "Make recurring...",
        },
        {
          icon: <Link2 aria-hidden className="size-5" strokeWidth={2} />,
          id: "link",
          label: "Add link...",
        },
      ],
    },
  ],
  prioritySections: [
    {
      id: "priority",
      options: [
        {
          icon: <span className="font-semibold text-muted-foreground">--</span>,
          id: "none",
          label: "No priority",
          rightMeta: "0",
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
  ],
  projectSections: createProjectSections(repository),
  statusSections: [
    {
      id: "status",
      options: [
        {
          icon: <CircleDashed aria-hidden className="size-5" strokeWidth={2.2} />,
          id: "backlog",
          label: "Backlog",
          rightMeta: "1",
        },
        {
          icon: <Circle aria-hidden className="size-5" strokeWidth={2.4} />,
          id: "todo",
          label: "Todo",
          rightMeta: "2",
        },
        {
          icon: <Circle aria-hidden className="size-5 text-warning" strokeWidth={2.4} />,
          id: "in-progress",
          label: "In Progress",
          rightMeta: "3",
        },
        {
          icon: <CircleCheck aria-hidden className="size-5 text-primary" strokeWidth={2.4} />,
          id: "done",
          label: "Done",
          rightMeta: "4",
        },
        {
          icon: (
            <CircleOff aria-hidden className="size-5 text-muted-foreground" strokeWidth={2.4} />
          ),
          id: "canceled",
          label: "Canceled",
          rightMeta: "5",
        },
      ],
    },
  ],
});

export const defaultCreateIssueMoreActionMessage = (actionId: string): string => {
  switch (actionId) {
    case "due-date":
      return "Use the due date field in the create dialog.";
    case "link":
      return "Issue links are not wired in the desktop renderer yet.";
    case "recurring":
      return "Recurring issues are not wired in the desktop renderer yet.";
    default:
      return "This issue action is not wired in the desktop renderer yet.";
  }
};
