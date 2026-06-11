import { Avatar, AvatarFallback } from "@cycle/ui/atoms";
import type { PropertyPickerSection } from "@cycle/ui/components/property-picker";
import { cn } from "@cycle/ui/utils";
import type {
  IssueTemplateDocument,
  LabelDefinitionDocument,
  UserProfileDocument,
} from "@cycle/database";
import {
  Box,
  CalendarPlus,
  Circle,
  CircleCheck,
  CircleDashed,
  CircleOff,
  CircleUserRound,
  FileText,
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
  readonly templateSections: readonly PropertyPickerSection[];
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

export const labelColorClassName = (color: string | undefined): string => {
  switch (color?.trim().toLowerCase()) {
    case "amber":
    case "yellow":
      return "bg-warning";
    case "blue":
      return "bg-primary";
    case "green":
      return "bg-success";
    case "red":
      return "bg-destructive";
    case "purple":
      return "bg-violet-500";
    case "pink":
      return "bg-pink-500";
    case "gray":
    case "grey":
    case "neutral":
      return "bg-muted-foreground";
    default:
      return "bg-muted-foreground";
  }
};

const LabelDot = ({ color }: { readonly color?: string }) => (
  <span aria-hidden className={cn("size-3.5 rounded-full", labelColorClassName(color))} />
);

const createAssigneeSections = ({
  profile,
  users,
}: {
  readonly profile?: ProfileConfig;
  readonly users?: readonly UserProfileDocument[];
}): readonly PropertyPickerSection[] => {
  const displayName = profile?.displayName.trim();
  const projectedOptions =
    users?.map((user) => ({
      icon: (
        <Avatar className="size-6">
          <AvatarFallback className="text-[10px]">
            {initialsForName(user.displayName)}
          </AvatarFallback>
        </Avatar>
      ),
      id: user.id,
      label: user.displayName,
      rightMeta: user.email,
    })) ?? [];
  const fallbackUserOption =
    projectedOptions.length === 0 && displayName && displayName.length > 0
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
        ...projectedOptions,
        ...fallbackUserOption,
      ],
    },
  ];
};

const createLabelSections = (
  labels?: readonly LabelDefinitionDocument[],
): readonly PropertyPickerSection[] => [
  {
    id: "labels",
    options:
      labels && labels.length > 0
        ? labels.map((label) => ({
            icon: <LabelDot color={label.color} />,
            id: label.id,
            label: label.name,
          }))
        : [
            {
              icon: <LabelDot color="red" />,
              id: "bug",
              label: "Bug",
            },
            {
              icon: <LabelDot color="blue" />,
              id: "feature",
              label: "Feature",
            },
            {
              icon: <LabelDot color="green" />,
              id: "improvement",
              label: "Improvement",
            },
          ],
  },
];

const createTemplateSections = (
  templates?: readonly IssueTemplateDocument[],
): readonly PropertyPickerSection[] => [
  {
    id: "templates",
    options: [
      {
        icon: <FileText aria-hidden className="size-5" strokeWidth={2} />,
        id: "none",
        label: "No template",
      },
      ...((templates ?? []).map((template) => ({
        icon: <FileText aria-hidden className="size-5" strokeWidth={2} />,
        id: template.id,
        label: template.name,
        rightMeta: template.kind,
      })) satisfies PropertyPickerSection["options"]),
    ],
  },
];

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
  labels,
  profile,
  repository,
  templates,
  users,
}: {
  readonly labels?: readonly LabelDefinitionDocument[];
  readonly profile?: ProfileConfig;
  readonly repository?: RepositoryRecord;
  readonly templates?: readonly IssueTemplateDocument[];
  readonly users?: readonly UserProfileDocument[];
}): CreateIssueDialogOptionSections => ({
  assigneeSections: createAssigneeSections({
    profile,
    users,
  }),
  labelSections: createLabelSections(labels),
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
  templateSections: createTemplateSections(templates),
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
