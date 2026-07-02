import {
  Bot,
  Box,
  CalendarPlus,
  ChevronRight,
  Circle,
  CircleCheck,
  CircleDashed,
  CircleOff,
  CircleUserRound,
  Expand,
  FileText,
  GitBranch,
  Link,
  Link2,
  MoreHorizontal,
  PenLine,
  Repeat2,
  SendHorizontal,
  Tag,
  Ticket,
} from "lucide-react";
import * as React from "react";
import { Avatar, AvatarFallback } from "../../atoms/avatar/index.ts";
import { Button } from "../../atoms/button/index.ts";
import { IconButton } from "../../atoms/icon-button/index.ts";
import { Input } from "../../atoms/input/index.ts";
import { Switch } from "../../atoms/switch/index.ts";
import { cn } from "../../lib/cn.ts";
import {
  DialogCloseButton,
  DialogPanel,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogViewport,
} from "../../molecules/dialog/index.ts";
import {
  MarkdownEditor,
  type MarkdownEditorTagSuggestion,
} from "../../molecules/markdown-editor/index.ts";
import {
  PropertyPicker,
  type PropertyPickerOption,
  type PropertyPickerSection,
  type PropertyPickerValue,
} from "../../molecules/property-picker/index.ts";

export type CreateIssueDialogChipId =
  | "assignee"
  | "labels"
  | "more"
  | "priority"
  | "project"
  | "repository"
  | "status"
  | "template"
  | "type";

export type CreateIssueDialogMode = "agent" | "manual";

export type CreateIssueDialogStatus = "backlog" | "canceled" | "done" | "in-progress" | "todo";

export type CreateIssueDialogPriority = "high" | "low" | "medium" | "none" | "urgent";

export type CreateIssueDialogProps = React.HTMLAttributes<HTMLDivElement> & {
  readonly assignee?: string | null;
  readonly createLabel?: string;
  readonly createDisabled?: boolean;
  readonly createMore?: boolean;
  readonly createMoreLabel?: string;
  readonly defaultOpenChip?: CreateIssueDialogChipId;
  readonly description?: string;
  readonly descriptionPlaceholder?: string;
  readonly draftDisabled?: boolean;
  readonly draftInstructions?: string;
  readonly draftPlaceholder?: string;
  readonly draftSaving?: boolean;
  readonly draftSubmitLabel?: string;
  readonly dueDate?: string;
  readonly error?: React.ReactNode;
  readonly estimate?: number | string | null;
  readonly heading?: React.ReactNode;
  readonly labels?: readonly string[];
  readonly labelSections?: readonly PropertyPickerSection[];
  readonly moreSections?: readonly PropertyPickerSection[];
  readonly mode?: CreateIssueDialogMode;
  readonly onAttach?: React.MouseEventHandler<HTMLButtonElement>;
  readonly onAssigneeChange?: (assignee: string | null) => void;
  readonly onClose?: React.MouseEventHandler<HTMLButtonElement>;
  readonly onCreate?: React.FormEventHandler<HTMLFormElement>;
  readonly onCreateMoreChange?: (checked: boolean) => void;
  readonly onDescriptionChange?: (description: string) => void;
  readonly onDraftInstructionsChange?: (instructions: string) => void;
  readonly onDraftSubmit?: React.FormEventHandler<HTMLFormElement>;
  readonly onDueDateChange?: (dueDate: string) => void;
  readonly onEstimateChange?: (estimate: string) => void;
  readonly onExpand?: React.MouseEventHandler<HTMLButtonElement>;
  readonly onLabelsChange?: (labels: readonly string[]) => void;
  readonly onModeChange?: (mode: CreateIssueDialogMode) => void;
  readonly onMoreAction?: (actionId: string, option: PropertyPickerOption) => void;
  readonly onOpenChipChange?: (chip: CreateIssueDialogChipId | undefined) => void;
  readonly onPriorityChange?: (priority: CreateIssueDialogPriority) => void;
  readonly onProjectChange?: (project: string | null) => void;
  readonly onRepositoryChange?: (repository: string | null) => void;
  readonly onStatusChange?: (status: CreateIssueDialogStatus) => void;
  readonly onTagQueryChange?: (query: string) => void;
  readonly onTagSelect?: (suggestion: MarkdownEditorTagSuggestion) => void;
  readonly onTitleChange?: (title: string) => void;
  readonly openChip?: CreateIssueDialogChipId;
  readonly priority?: CreateIssueDialogPriority;
  readonly prioritySections?: readonly PropertyPickerSection[];
  readonly project?: string | null;
  readonly projectSections?: readonly PropertyPickerSection[];
  readonly repository?: string | null;
  readonly repositorySections?: readonly PropertyPickerSection[];
  readonly saving?: boolean;
  readonly status?: CreateIssueDialogStatus;
  readonly statusSections?: readonly PropertyPickerSection[];
  readonly assigneeSections?: readonly PropertyPickerSection[];
  readonly tagSuggestions?: readonly MarkdownEditorTagSuggestion[];
  readonly teamLabel?: string;
  readonly template?: string | null;
  readonly templateSections?: readonly PropertyPickerSection[];
  readonly onTemplateChange?: (template: string | null) => void;
  readonly title?: string;
  readonly titlePlaceholder?: string;
  readonly type?: string;
  readonly typeSections?: readonly PropertyPickerSection[];
  readonly onTypeChange?: (type: string) => void;
};

const IssueTeamMark = () => (
  <span
    aria-hidden
    className="grid size-5 place-items-center rounded-md bg-success/14 text-success"
  >
    <span className="size-2.5 rounded-sm border-2 border-current" />
  </span>
);

const PriorityBars = ({ level }: { readonly level: 1 | 2 | 3 }) => (
  <span aria-hidden className="flex h-5 items-end gap-0.5 text-muted-foreground">
    {[1, 2, 3].map((bar) => (
      <span
        className={cn("w-1.5 rounded-sm bg-current", bar > level && "opacity-35")}
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

const AssigneeAvatar = () => (
  <Avatar className="size-6">
    <AvatarFallback className="text-[10px]">RP</AvatarFallback>
  </Avatar>
);

const statusSections: readonly PropertyPickerSection[] = [
  {
    id: "status",
    options: [
      {
        icon: <CircleDashed aria-hidden className="size-5 animate-spin" strokeWidth={2.2} />,
        id: "backlog",
        label: "Backlog",
        rightMeta: "1",
      },
      {
        icon: <Circle aria-hidden className="size-5" strokeWidth={2.4} />,
        id: "todo",
        label: "Todo",
        rightMeta: "2",
        selected: true,
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
        icon: <CircleOff aria-hidden className="size-5 text-muted-foreground" strokeWidth={2.4} />,
        id: "canceled",
        label: "Canceled",
        rightMeta: "5",
      },
    ],
  },
];

const prioritySections: readonly PropertyPickerSection[] = [
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

const assigneeSections: readonly PropertyPickerSection[] = [
  {
    id: "assignee",
    options: [
      {
        icon: <CircleUserRound aria-hidden className="size-5" strokeWidth={2} />,
        id: "none",
        label: "No assignee",
        rightMeta: "0",
        selected: true,
      },
      {
        icon: <AssigneeAvatar />,
        id: "robert-pitt",
        label: "Robert Pitt",
        rightMeta: "1",
      },
    ],
  },
];

const projectSections: readonly PropertyPickerSection[] = [
  {
    id: "project",
    label: "Projects in Robert-pitt t...",
    options: [
      {
        icon: <CircleDashed aria-hidden className="size-5" strokeWidth={2.2} />,
        id: "none",
        label: "No project",
        rightMeta: "0",
        selected: true,
      },
      {
        icon: <Box aria-hidden className="size-5" strokeWidth={2} />,
        id: "test",
        label: "test",
      },
    ],
  },
];

const labelSections: readonly PropertyPickerSection[] = [
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

const templateSections: readonly PropertyPickerSection[] = [
  {
    id: "templates",
    options: [
      {
        icon: <FileText aria-hidden className="size-5" strokeWidth={2} />,
        id: "none",
        label: "No template",
      },
    ],
  },
];

const moreSections: readonly PropertyPickerSection[] = [
  {
    id: "schedule",
    options: [
      {
        icon: <CalendarPlus aria-hidden className="size-5" strokeWidth={2} />,
        id: "due-date",
        label: "Set due date",
        rightMeta: "⇧ D  ›",
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
        rightMeta: "Ctrl L",
      },
    ],
  },
  {
    id: "create",
    options: [
      {
        icon: <Box aria-hidden className="size-5" strokeWidth={2} />,
        id: "sub-issue",
        label: "Add sub-issue",
        rightMeta: "⌘ ⇧ O",
      },
    ],
  },
];

const getControlledOpen = (
  currentChip: CreateIssueDialogChipId | undefined,
  chip: CreateIssueDialogChipId,
  setOpenChip: (chip: CreateIssueDialogChipId | undefined) => void,
) => ({
  onOpenChange: (open: boolean) => setOpenChip(open ? chip : undefined),
  open: currentChip === chip,
});

const getTextFromNode = (node: React.ReactNode): string => {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }

  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(getTextFromNode).join("");
  }

  return "";
};

const getSingleValue = (value: PropertyPickerValue): string | null => {
  if (value === null || typeof value === "string") {
    return value;
  }

  return value[0] ?? null;
};

const formatNullableLabel =
  (fallback: React.ReactNode) => (selectedOptions: readonly PropertyPickerOption[]) => {
    const selectedOption = selectedOptions[0];

    if (!selectedOption || selectedOption.id === "none") {
      return fallback;
    }

    return selectedOption.label;
  };

const formatLabelList = (selectedOptions: readonly PropertyPickerOption[]) => {
  if (selectedOptions.length === 0) {
    return "Labels";
  }

  return selectedOptions
    .map((option) => getTextFromNode(option.label))
    .filter(Boolean)
    .join(", ");
};

export const CreateIssueDialog = React.forwardRef<HTMLDivElement, CreateIssueDialogProps>(
  function CreateIssueDialog(
    {
      assignee = null,
      className,
      createLabel = "Create issue",
      createDisabled = false,
      createMore = false,
      createMoreLabel = "Create more",
      defaultOpenChip,
      description,
      descriptionPlaceholder = "Add description",
      draftDisabled = false,
      draftInstructions = "",
      draftPlaceholder = "Draft a ticket for...",
      draftSaving = false,
      draftSubmitLabel = "Draft ticket",
      dueDate = "",
      error,
      estimate = "",
      heading = "New issue",
      assigneeSections: assigneePickerSections = assigneeSections,
      labelSections: labelPickerSections = labelSections,
      labels = [],
      moreSections: morePickerSections = moreSections,
      mode = "agent",
      onAttach,
      onAssigneeChange,
      onClose,
      onCreate,
      onCreateMoreChange,
      onDescriptionChange,
      onDraftInstructionsChange,
      onDraftSubmit,
      onDueDateChange,
      onEstimateChange,
      onExpand,
      onLabelsChange,
      onModeChange,
      onMoreAction,
      onOpenChipChange,
      onPriorityChange,
      onProjectChange,
      onRepositoryChange,
      onStatusChange,
      onTagQueryChange,
      onTagSelect,
      onTitleChange,
      openChip,
      priority = "none",
      prioritySections: priorityPickerSections = prioritySections,
      project = null,
      projectSections: projectPickerSections = projectSections,
      repository = null,
      repositorySections: repositoryPickerSections = [],
      saving = false,
      status = "todo",
      statusSections: statusPickerSections = statusSections,
      teamLabel = "ROB",
      tagSuggestions,
      template = null,
      templateSections: templatePickerSections = templateSections,
      onTemplateChange,
      onTypeChange,
      title,
      titlePlaceholder = "Issue title",
      type,
      typeSections: typePickerSections = [],
      ...props
    },
    ref,
  ) {
    const [uncontrolledOpenChip, setUncontrolledOpenChip] = React.useState(defaultOpenChip);
    const currentOpenChip = openChip ?? uncontrolledOpenChip;
    const setOpenChip = React.useCallback(
      (chip: CreateIssueDialogChipId | undefined) => {
        if (openChip === undefined) {
          setUncontrolledOpenChip(chip);
        }
        onOpenChipChange?.(chip);
      },
      [onOpenChipChange, openChip],
    );
    const submitHandler: React.FormEventHandler<HTMLFormElement> = (event) => {
      const handler = mode === "agent" ? onDraftSubmit : onCreate;
      if (handler) {
        handler(event);
        return;
      }
      event.preventDefault();
    };
    const errorMessage = error ? (
      <div className="rounded-md border border-destructive/25 bg-destructive/10 p-3 text-sm leading-5 text-destructive">
        {error}
      </div>
    ) : null;
    const manualMode = mode === "manual";

    return (
      <DialogRoot open modal>
        <DialogPortal>
          <DialogViewport
            {...props}
            ref={ref}
            className={cn(
              "items-end justify-items-stretch bg-overlay/60 p-3 backdrop-blur-[1px] sm:items-start sm:p-8 sm:pt-10",
              className,
            )}
          >
            <DialogPanel
              className="mx-auto min-h-[400px] max-w-[960px] overflow-visible rounded-2xl"
              width="xl"
            >
              <form className="flex min-h-[400px] flex-col" onSubmit={submitHandler}>
                <div className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="flex min-w-0 items-center gap-2">
                    {repositoryPickerSections.length > 0 ? (
                      <PropertyPicker
                        {...getControlledOpen(currentOpenChip, "repository", setOpenChip)}
                        formatValueLabel={formatNullableLabel(teamLabel)}
                        onValueChange={(value) => onRepositoryChange?.(getSingleValue(value))}
                        placeholder={teamLabel}
                        searchPlaceholder="Choose repository..."
                        sections={repositoryPickerSections}
                        triggerActive={Boolean(repository)}
                        triggerIcon={<GitBranch aria-hidden className="size-4" strokeWidth={1.8} />}
                        value={repository}
                        widthClassName="w-[420px]"
                      />
                    ) : (
                      <span className="inline-flex h-8 shrink-0 items-center gap-2 rounded-full border border-border bg-subtle px-2.5 text-sm font-medium text-muted-foreground">
                        <IssueTeamMark />
                        {teamLabel}
                      </span>
                    )}
                    <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    <DialogTitle
                      className="truncate text-lg font-semibold tracking-normal text-foreground"
                      id="create-issue-dialog-title"
                    >
                      {heading}
                    </DialogTitle>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <IconButton
                      icon={<Expand aria-hidden className="size-4" />}
                      label="Expand dialog"
                      onClick={onExpand}
                      size="sm"
                      title="Expand dialog"
                    />
                    <DialogCloseButton
                      label="Close dialog"
                      onClick={onClose}
                      title="Close dialog"
                    />
                  </div>
                </div>

                <div className="flex flex-1 flex-col px-5 pb-5 sm:px-7 sm:pb-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground">
                      {manualMode ? (
                        <PenLine aria-hidden className="size-4 shrink-0" />
                      ) : (
                        <Bot aria-hidden className="size-4 shrink-0" />
                      )}
                      <span className="truncate">
                        {manualMode ? "Manual ticket" : "Agent-assisted ticket"}
                      </span>
                    </div>
                    <label className="inline-flex items-center gap-2 rounded-full border border-border bg-subtle px-3 py-1.5 text-sm font-medium text-muted-foreground">
                      <Switch
                        aria-label="Manual ticket mode"
                        checked={manualMode}
                        onCheckedChange={(checked) => onModeChange?.(checked ? "manual" : "agent")}
                      />
                      Manual
                    </label>
                  </div>

                  {mode === "agent" ? (
                    <div className="flex flex-1 flex-col">
                      <MarkdownEditor
                        aria-label="Ticket draft instructions"
                        className="rounded-lg"
                        contentClassName="text-base leading-7 sm:text-lg"
                        editorClassName="border-border bg-subtle/45 hover:bg-subtle/60 focus-within:bg-popover"
                        minHeightClassName="min-h-[220px]"
                        mode="ticket"
                        onTagQueryChange={onTagQueryChange}
                        onTagSelect={onTagSelect}
                        onValueChange={onDraftInstructionsChange}
                        placeholder={draftPlaceholder}
                        tagSuggestions={tagSuggestions}
                        value={draftInstructions}
                      />

                      <div className="mt-5 flex flex-wrap items-center gap-2">
                        <PropertyPicker
                          {...getControlledOpen(currentOpenChip, "status", setOpenChip)}
                          formatValueLabel={formatNullableLabel("Status")}
                          onValueChange={(value) =>
                            onStatusChange?.(getSingleValue(value) as CreateIssueDialogStatus)
                          }
                          placeholder="Status"
                          searchPlaceholder="Change status..."
                          searchShortcut="S"
                          sections={statusPickerSections}
                          triggerActive
                          triggerIcon={<Circle aria-hidden className="size-4" strokeWidth={2.2} />}
                          value={status}
                          widthClassName="w-[414px]"
                        />
                        {typePickerSections.length > 0 ? (
                          <PropertyPicker
                            {...getControlledOpen(currentOpenChip, "type", setOpenChip)}
                            formatValueLabel={formatNullableLabel("Type")}
                            onValueChange={(value) => {
                              const selectedType = getSingleValue(value);
                              if (selectedType) onTypeChange?.(selectedType);
                            }}
                            placeholder="Type"
                            searchPlaceholder="Choose type..."
                            sections={typePickerSections}
                            triggerActive={Boolean(type)}
                            triggerIcon={
                              <Ticket aria-hidden className="size-4" strokeWidth={1.9} />
                            }
                            value={type}
                            widthClassName="w-[350px]"
                          />
                        ) : null}
                        <PropertyPicker
                          {...getControlledOpen(currentOpenChip, "priority", setOpenChip)}
                          formatValueLabel={formatNullableLabel("Priority")}
                          onValueChange={(value) =>
                            onPriorityChange?.(getSingleValue(value) as CreateIssueDialogPriority)
                          }
                          placeholder="Priority"
                          searchPlaceholder="Set priority to..."
                          searchShortcut="P"
                          sections={priorityPickerSections}
                          triggerIcon={<span className="font-semibold leading-none">---</span>}
                          value={priority}
                          widthClassName="w-[414px]"
                        />
                        <PropertyPicker
                          {...getControlledOpen(currentOpenChip, "assignee", setOpenChip)}
                          formatValueLabel={formatNullableLabel("Assignee")}
                          onValueChange={(value) => {
                            const selectedAssignee = getSingleValue(value);
                            onAssigneeChange?.(
                              selectedAssignee === "none" ? null : selectedAssignee,
                            );
                          }}
                          placeholder="Assignee"
                          sections={assigneePickerSections}
                          triggerIcon={
                            <CircleUserRound aria-hidden className="size-4" strokeWidth={1.8} />
                          }
                          value={assignee ?? "none"}
                          widthClassName="w-[350px]"
                        />
                        <PropertyPicker
                          {...getControlledOpen(currentOpenChip, "template", setOpenChip)}
                          align="end"
                          formatValueLabel={formatNullableLabel("Template")}
                          onValueChange={(value) => {
                            const selectedTemplate = getSingleValue(value);
                            onTemplateChange?.(
                              selectedTemplate === "none" ? null : selectedTemplate,
                            );
                          }}
                          placeholder="Template"
                          searchPlaceholder="Apply template..."
                          sections={templatePickerSections}
                          triggerIcon={
                            <FileText aria-hidden className="size-4" strokeWidth={1.8} />
                          }
                          value={template ?? "none"}
                          widthClassName="w-[350px]"
                        />
                        <PropertyPicker
                          {...getControlledOpen(currentOpenChip, "labels", setOpenChip)}
                          align="end"
                          formatValueLabel={formatLabelList}
                          multiple
                          onValueChange={(value) =>
                            onLabelsChange?.(Array.isArray(value) ? value : value ? [value] : [])
                          }
                          placeholder="Labels"
                          searchPlaceholder="Add labels..."
                          searchShortcut="L"
                          sections={labelPickerSections}
                          triggerIcon={<Tag aria-hidden className="size-4" strokeWidth={1.8} />}
                          value={labels}
                          widthClassName="w-[414px]"
                        />
                      </div>

                      <div className="mt-auto grid gap-4 pt-6">
                        {errorMessage}

                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <IconButton
                            icon={<Link aria-hidden className="size-4" />}
                            label="Attach file"
                            onClick={onAttach}
                            title="Attach file"
                            variant="outline"
                          />
                          <Button
                            className="h-10 rounded-full px-5 text-base"
                            disabled={draftDisabled || draftSaving}
                            leftIcon={<SendHorizontal aria-hidden className="size-4" />}
                            loading={draftSaving}
                            loadingLabel="Starting draft"
                            type="submit"
                          >
                            {draftSubmitLabel}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-3">
                        <Input
                          aria-label="Issue title"
                          className="h-12 border-transparent bg-transparent px-0 text-2xl font-semibold tracking-normal shadow-none placeholder:text-muted-foreground/70 hover:border-transparent focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-3xl"
                          name="title"
                          onChange={(event) => onTitleChange?.(event.currentTarget.value)}
                          placeholder={titlePlaceholder}
                          required
                          value={title}
                        />
                        <MarkdownEditor
                          aria-label="Issue description"
                          className="rounded-md"
                          contentClassName="px-0 text-lg leading-7"
                          editorClassName="border-transparent bg-transparent hover:bg-transparent focus-within:border-transparent focus-within:bg-transparent"
                          minHeightClassName="min-h-[132px]"
                          mode="ticket"
                          onTagQueryChange={onTagQueryChange}
                          onTagSelect={onTagSelect}
                          onValueChange={onDescriptionChange}
                          placeholder={descriptionPlaceholder}
                          tagSuggestions={tagSuggestions}
                          value={description}
                        />
                      </div>

                      <div className="mt-auto grid gap-12 pt-8">
                        <div className="flex flex-wrap items-center gap-2">
                          <PropertyPicker
                            {...getControlledOpen(currentOpenChip, "status", setOpenChip)}
                            formatValueLabel={formatNullableLabel("Status")}
                            onValueChange={(value) =>
                              onStatusChange?.(getSingleValue(value) as CreateIssueDialogStatus)
                            }
                            placeholder="Status"
                            searchPlaceholder="Change status..."
                            searchShortcut="S"
                            sections={statusPickerSections}
                            triggerActive
                            triggerIcon={
                              <Circle aria-hidden className="size-4" strokeWidth={2.2} />
                            }
                            value={status}
                            widthClassName="w-[414px]"
                          />
                          {typePickerSections.length > 0 ? (
                            <PropertyPicker
                              {...getControlledOpen(currentOpenChip, "type", setOpenChip)}
                              formatValueLabel={formatNullableLabel("Type")}
                              onValueChange={(value) => {
                                const selectedType = getSingleValue(value);
                                if (selectedType) onTypeChange?.(selectedType);
                              }}
                              placeholder="Type"
                              searchPlaceholder="Choose type..."
                              sections={typePickerSections}
                              triggerActive={Boolean(type)}
                              triggerIcon={
                                <Ticket aria-hidden className="size-4" strokeWidth={1.9} />
                              }
                              value={type}
                              widthClassName="w-[350px]"
                            />
                          ) : null}
                          <PropertyPicker
                            {...getControlledOpen(currentOpenChip, "priority", setOpenChip)}
                            formatValueLabel={formatNullableLabel("Priority")}
                            onValueChange={(value) =>
                              onPriorityChange?.(getSingleValue(value) as CreateIssueDialogPriority)
                            }
                            placeholder="Priority"
                            searchPlaceholder="Set priority to..."
                            searchShortcut="P"
                            sections={priorityPickerSections}
                            triggerIcon={<span className="font-semibold leading-none">---</span>}
                            value={priority}
                            widthClassName="w-[414px]"
                          />
                          <PropertyPicker
                            {...getControlledOpen(currentOpenChip, "assignee", setOpenChip)}
                            formatValueLabel={formatNullableLabel("Assignee")}
                            onValueChange={(value) => {
                              const selectedAssignee = getSingleValue(value);
                              onAssigneeChange?.(
                                selectedAssignee === "none" ? null : selectedAssignee,
                              );
                            }}
                            placeholder="Assignee"
                            sections={assigneePickerSections}
                            triggerIcon={
                              <CircleUserRound aria-hidden className="size-4" strokeWidth={1.8} />
                            }
                            value={assignee ?? "none"}
                            widthClassName="w-[350px]"
                          />
                          <PropertyPicker
                            {...getControlledOpen(currentOpenChip, "project", setOpenChip)}
                            align="end"
                            formatValueLabel={formatNullableLabel("Project")}
                            onValueChange={(value) => {
                              const selectedProject = getSingleValue(value);
                              onProjectChange?.(
                                selectedProject === "none" ? null : selectedProject,
                              );
                            }}
                            placeholder="Project"
                            sections={projectPickerSections}
                            triggerIcon={<Box aria-hidden className="size-4" strokeWidth={1.8} />}
                            value={project ?? "none"}
                            widthClassName="w-[350px]"
                          />
                          <PropertyPicker
                            {...getControlledOpen(currentOpenChip, "template", setOpenChip)}
                            align="end"
                            formatValueLabel={formatNullableLabel("Template")}
                            onValueChange={(value) => {
                              const selectedTemplate = getSingleValue(value);
                              onTemplateChange?.(
                                selectedTemplate === "none" ? null : selectedTemplate,
                              );
                            }}
                            placeholder="Template"
                            searchPlaceholder="Apply template..."
                            sections={templatePickerSections}
                            triggerIcon={
                              <FileText aria-hidden className="size-4" strokeWidth={1.8} />
                            }
                            value={template ?? "none"}
                            widthClassName="w-[350px]"
                          />
                          <PropertyPicker
                            {...getControlledOpen(currentOpenChip, "labels", setOpenChip)}
                            align="end"
                            formatValueLabel={formatLabelList}
                            multiple
                            onValueChange={(value) =>
                              onLabelsChange?.(Array.isArray(value) ? value : value ? [value] : [])
                            }
                            placeholder="Labels"
                            searchPlaceholder="Add labels..."
                            searchShortcut="L"
                            sections={labelPickerSections}
                            triggerIcon={<Tag aria-hidden className="size-4" strokeWidth={1.8} />}
                            value={labels}
                            widthClassName="w-[414px]"
                          />
                          <label className="inline-flex h-9 min-w-[9.5rem] items-center gap-2 rounded-md border border-border bg-popover px-3 text-sm font-medium text-muted-foreground shadow-sm">
                            <CalendarPlus aria-hidden className="size-4" />
                            <span className="sr-only">Due date</span>
                            <input
                              className="min-w-0 bg-transparent text-foreground outline-none"
                              onChange={(event) => onDueDateChange?.(event.currentTarget.value)}
                              type="date"
                              value={dueDate}
                            />
                          </label>
                          <Input
                            aria-label="Estimate"
                            className="h-9 w-28 rounded-md"
                            inputMode="decimal"
                            onChange={(event) => onEstimateChange?.(event.currentTarget.value)}
                            placeholder="Estimate"
                            value={estimate ?? ""}
                          />
                          <PropertyPicker
                            {...getControlledOpen(currentOpenChip, "more", setOpenChip)}
                            align="end"
                            onValueChange={(value, option) => {
                              const actionId = getSingleValue(value);
                              if (actionId) {
                                onMoreAction?.(actionId, option);
                              }
                            }}
                            placeholder={<span className="sr-only">More issue properties</span>}
                            sections={morePickerSections}
                            triggerIcon={
                              <MoreHorizontal aria-hidden className="size-4" strokeWidth={1.8} />
                            }
                            triggerLabelText="More issue properties"
                            value={null}
                            widthClassName="w-[384px]"
                          />
                        </div>

                        {errorMessage}

                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <IconButton
                            icon={<Link aria-hidden className="size-4" />}
                            label="Attach file"
                            onClick={onAttach}
                            title="Attach file"
                            variant="outline"
                          />
                          <div className="flex flex-wrap items-center gap-4">
                            <label className="inline-flex items-center gap-3 text-sm font-medium text-muted-foreground">
                              <Switch checked={createMore} onCheckedChange={onCreateMoreChange} />
                              {createMoreLabel}
                            </label>
                            <Button
                              className="h-10 rounded-full px-5 text-base"
                              disabled={createDisabled || saving}
                              loading={saving}
                              loadingLabel="Creating issue"
                              type="submit"
                            >
                              {createLabel}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </form>
            </DialogPanel>
          </DialogViewport>
        </DialogPortal>
      </DialogRoot>
    );
  },
);
