import { Circle, MoreHorizontal, Paperclip } from "lucide-react";
import * as React from "react";
import { Button } from "../../atoms/button/index.ts";
import { IconButton } from "../../atoms/icon-button/index.ts";
import { cn } from "../../lib/cn.ts";
import { focusRing, typography } from "../../lib/styles.ts";
import { PropertyPicker, type PropertyPickerSection } from "../property-picker/index.ts";

export type IssueSubIssueDraft = {
  readonly description?: string;
  readonly priority?: string | null;
  readonly status?: string | null;
  readonly title: string;
};

export type IssueSubIssueComposerProps = Omit<React.HTMLAttributes<HTMLFormElement>, "onSubmit"> & {
  readonly assigneeSections?: readonly PropertyPickerSection[];
  readonly defaultDescription?: string;
  readonly defaultPriority?: string | null;
  readonly defaultStatus?: string | null;
  readonly defaultTitle?: string;
  readonly onCancel?: () => void;
  readonly onSubmit?: (draft: IssueSubIssueDraft) => void;
  readonly prioritySections?: readonly PropertyPickerSection[];
  readonly statusSections?: readonly PropertyPickerSection[];
  readonly teamLabel?: React.ReactNode;
};

const defaultStatusSections: readonly PropertyPickerSection[] = [
  {
    id: "status",
    options: [
      {
        icon: <Circle aria-hidden className="size-4" />,
        id: "todo",
        label: "Todo",
      },
      {
        icon: <Circle aria-hidden className="size-4 text-warning" />,
        id: "in-progress",
        label: "In Progress",
      },
    ],
  },
];

const defaultPrioritySections: readonly PropertyPickerSection[] = [
  {
    id: "priority",
    options: [
      {
        id: "none",
        label: "No priority",
      },
      {
        icon: <span className="font-semibold">!!!</span>,
        id: "high",
        label: "High",
      },
    ],
  },
];

const defaultAssigneeSections: readonly PropertyPickerSection[] = [
  {
    id: "assignee",
    options: [
      {
        id: "unassigned",
        label: "Unassigned",
      },
      {
        id: "robert",
        label: "Robert Pitt",
      },
    ],
  },
];

export const IssueSubIssueComposer = React.forwardRef<HTMLFormElement, IssueSubIssueComposerProps>(
  function IssueSubIssueComposer(
    {
      assigneeSections = defaultAssigneeSections,
      className,
      defaultDescription = "",
      defaultPriority = "none",
      defaultStatus = "todo",
      defaultTitle = "",
      onCancel,
      onSubmit,
      prioritySections = defaultPrioritySections,
      statusSections = defaultStatusSections,
      teamLabel = "ROB",
      ...props
    },
    ref,
  ) {
    const [title, setTitle] = React.useState(defaultTitle);
    const [description, setDescription] = React.useState(defaultDescription);
    const [status, setStatus] = React.useState<string | null>(defaultStatus);
    const [priority, setPriority] = React.useState<string | null>(defaultPriority);
    const createDisabled = title.trim().length === 0;

    return (
      <form
        {...props}
        ref={ref}
        className={cn(
          "grid gap-4 rounded-lg border border-border bg-elevated p-4 text-elevated-foreground shadow-card",
          className,
        )}
        onSubmit={(event) => {
          event.preventDefault();
          const trimmedTitle = title.trim();
          if (!trimmedTitle) return;

          onSubmit?.({
            description: description.trim() || undefined,
            priority,
            status,
            title: trimmedTitle,
          });
          setTitle("");
          setDescription("");
        }}
      >
        <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3">
          <Circle aria-hidden className="mt-2 size-5 text-foreground" strokeWidth={2.4} />
          <div className="grid gap-3">
            <input
              aria-label="Sub-issue title"
              className={cn(
                "h-8 bg-transparent text-foreground outline-none placeholder:text-muted-foreground",
                focusRing,
                typography.sectionTitle,
              )}
              onChange={(event) => setTitle(event.currentTarget.value)}
              placeholder="Issue title"
              value={title}
            />
            <textarea
              aria-label="Sub-issue description"
              className={cn(
                "min-h-12 resize-none bg-transparent text-foreground outline-none placeholder:text-muted-foreground",
                focusRing,
                typography.bodyCompact,
              )}
              onChange={(event) => setDescription(event.currentTarget.value)}
              placeholder="Add description..."
              value={description}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PropertyPicker
            placeholder={teamLabel}
            sections={assigneeSections}
            triggerIcon={<span className="text-success">#</span>}
            widthClassName="w-[280px]"
          />
          <PropertyPicker
            onValueChange={(value) => setPriority(typeof value === "string" ? value : null)}
            placeholder="Priority"
            sections={prioritySections}
            triggerIcon={<span className="font-semibold">|||</span>}
            value={priority}
            widthClassName="w-[280px]"
          />
          <PropertyPicker
            onValueChange={(value) => setStatus(typeof value === "string" ? value : null)}
            placeholder="Status"
            sections={statusSections}
            triggerIcon={<Circle aria-hidden className="size-4" />}
            value={status}
            widthClassName="w-[280px]"
          />
          <IconButton
            icon={<MoreHorizontal aria-hidden className="size-4" />}
            label="More sub-issue properties"
            size="sm"
            title="More sub-issue properties"
          />
          <span className="flex-1" />
          <IconButton
            icon={<Paperclip aria-hidden className="size-4" />}
            label="Attach file"
            size="sm"
            title="Attach file"
          />
          <Button onClick={onCancel} variant="ghost">
            Cancel
          </Button>
          <Button disabled={createDisabled} type="submit">
            Create
          </Button>
        </div>
      </form>
    );
  },
);
