import {
  IssueAssigneeMark,
  IssuePriorityMark,
  IssueStatusMark,
  type PropertyPickerSection,
} from "@cycle/ui/molecules";
import { cn } from "@cycle/ui/utils";
import type {
  IssueTemplateDocument,
  LabelDefinitionDocument,
  UserProfileDocument,
} from "@cycle/contracts/schemas";
import { Box, CalendarPlus, CircleDashed, FileText, Link2, Repeat2 } from "lucide-react";
import type { ProfileConfig, RepositoryRecord } from "@cycle/config";

export type CreateIssueDialogOptionSections = {
  readonly assigneeSections: readonly PropertyPickerSection[];
  readonly labelSections: readonly PropertyPickerSection[];
  readonly moreSections: readonly PropertyPickerSection[];
  readonly prioritySections: readonly PropertyPickerSection[];
  readonly projectSections: readonly PropertyPickerSection[];
  readonly statusSections: readonly PropertyPickerSection[];
  readonly templateSections: readonly PropertyPickerSection[];
};

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
      icon: <IssueAssigneeMark name={user.displayName} size="md" />,
      id: user.id,
      label: user.displayName,
      rightMeta: user.email,
    })) ?? [];
  const fallbackUserOption =
    projectedOptions.length === 0 && displayName && displayName.length > 0
      ? [
          {
            icon: <IssueAssigneeMark name={displayName} size="md" />,
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
          icon: <IssueAssigneeMark size="md" />,
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
          icon: <IssuePriorityMark priority="none" size="md" />,
          id: "none",
          label: "No priority",
          rightMeta: "0",
        },
        {
          icon: <IssuePriorityMark priority="urgent" size="md" />,
          id: "urgent",
          label: "Urgent",
          rightMeta: "1",
        },
        {
          icon: <IssuePriorityMark priority="high" size="md" />,
          id: "high",
          label: "High",
          rightMeta: "2",
        },
        {
          icon: <IssuePriorityMark priority="medium" size="md" />,
          id: "medium",
          label: "Medium",
          rightMeta: "3",
        },
        {
          icon: <IssuePriorityMark priority="low" size="md" />,
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
          icon: <IssueStatusMark status="backlog" size="md" />,
          id: "backlog",
          label: "Backlog",
          rightMeta: "1",
        },
        {
          icon: <IssueStatusMark status="todo" size="md" />,
          id: "todo",
          label: "Todo",
          rightMeta: "2",
        },
        {
          icon: <IssueStatusMark status="in-progress" size="md" />,
          id: "in-progress",
          label: "In Progress",
          rightMeta: "3",
        },
        {
          icon: <IssueStatusMark status="done" size="md" />,
          id: "done",
          label: "Done",
          rightMeta: "4",
        },
        {
          icon: <IssueStatusMark status="canceled" size="md" />,
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
