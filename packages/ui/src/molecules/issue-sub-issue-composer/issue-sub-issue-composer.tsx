import { Circle, MoreHorizontal, Paperclip } from "lucide-react";
import * as React from "react";
import { Button } from "../../atoms/button/index.ts";
import { IconButton } from "../../atoms/icon-button/index.ts";
import { cn } from "../../lib/cn.ts";
import { focusRing, typography } from "../../lib/styles.ts";
import { PropertyPicker, type PropertyPickerSection } from "../property-picker/index.ts";

export type IssueSubIssueDraft = {
  readonly assignee?: string | null;
  readonly description?: string;
  readonly priority?: string | null;
  readonly status?: string | null;
  readonly title: string;
};

export type IssueSubIssueComposerProps = Omit<React.HTMLAttributes<HTMLFormElement>, "onSubmit"> & {
  readonly assigneeLabel?: React.ReactNode;
  readonly assigneeSections?: readonly PropertyPickerSection[];
  readonly cancelLabel?: React.ReactNode;
  readonly defaultAssignee?: string | null;
  readonly defaultDescription?: string;
  readonly defaultPriority?: string | null;
  readonly defaultStatus?: string | null;
  readonly defaultTitle?: string;
  readonly descriptionLabel?: string;
  readonly onAttach?: React.MouseEventHandler<HTMLButtonElement>;
  readonly onCancel?: () => void;
  readonly onMore?: React.MouseEventHandler<HTMLButtonElement>;
  readonly onSubmit?: (draft: IssueSubIssueDraft) => void;
  readonly onValueChange?: (draft: IssueSubIssueDraft) => void;
  readonly priorityLabel?: React.ReactNode;
  readonly prioritySections?: readonly PropertyPickerSection[];
  readonly statusLabel?: React.ReactNode;
  readonly statusSections?: readonly PropertyPickerSection[];
  readonly submitLabel?: React.ReactNode;
  /** @deprecated Prefer `assigneeLabel`. */
  readonly teamLabel?: React.ReactNode;
  readonly titleLabel?: string;
  readonly value?: IssueSubIssueDraft;
};

const emptySections: readonly PropertyPickerSection[] = [];

export const IssueSubIssueComposer = React.forwardRef<HTMLFormElement, IssueSubIssueComposerProps>(
  function IssueSubIssueComposer(
    {
      assigneeLabel,
      assigneeSections = emptySections,
      cancelLabel = "Cancel",
      className,
      defaultAssignee = null,
      defaultDescription = "",
      defaultPriority = null,
      defaultStatus = null,
      defaultTitle = "",
      descriptionLabel = "Sub-issue description",
      onAttach,
      onCancel,
      onMore,
      onSubmit,
      onValueChange,
      priorityLabel = "Priority",
      prioritySections = emptySections,
      statusLabel = "Status",
      statusSections = emptySections,
      submitLabel = "Create",
      teamLabel,
      titleLabel = "Sub-issue title",
      value,
      ...props
    },
    ref,
  ) {
    const isControlled = value !== undefined;
    const initialDraft = React.useMemo<IssueSubIssueDraft>(
      () => ({
        assignee: defaultAssignee,
        description: defaultDescription,
        priority: defaultPriority,
        status: defaultStatus,
        title: defaultTitle,
      }),
      [defaultAssignee, defaultDescription, defaultPriority, defaultStatus, defaultTitle],
    );
    const [uncontrolledDraft, setUncontrolledDraft] = React.useState(initialDraft);
    const draft = value ?? uncontrolledDraft;
    const resolvedAssigneeLabel = assigneeLabel ?? teamLabel ?? "Assignee";
    const createDisabled = draft.title.trim().length === 0;

    const updateDraft = React.useCallback(
      (patch: Partial<IssueSubIssueDraft>) => {
        const nextDraft = { ...draft, ...patch };
        if (!isControlled) {
          setUncontrolledDraft(nextDraft);
        }
        onValueChange?.(nextDraft);
      },
      [draft, isControlled, onValueChange],
    );

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
          const trimmedTitle = draft.title.trim();
          if (!trimmedTitle || !onSubmit) return;

          onSubmit({
            ...draft,
            description: draft.description?.trim() || undefined,
            title: trimmedTitle,
          });

          if (!isControlled) {
            setUncontrolledDraft({
              ...initialDraft,
              description: "",
              title: "",
            });
          }
        }}
      >
        <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3">
          <Circle aria-hidden className="mt-2 size-5 text-foreground" strokeWidth={2.4} />
          <div className="grid gap-3">
            <input
              aria-label={titleLabel}
              className={cn(
                "h-8 bg-transparent text-foreground outline-none placeholder:text-muted-foreground",
                focusRing,
                typography.sectionTitle,
              )}
              onChange={(event) => updateDraft({ title: event.currentTarget.value })}
              placeholder="Issue title"
              value={draft.title}
            />
            <textarea
              aria-label={descriptionLabel}
              className={cn(
                "min-h-12 resize-none bg-transparent text-foreground outline-none placeholder:text-muted-foreground",
                focusRing,
                typography.bodyCompact,
              )}
              onChange={(event) => updateDraft({ description: event.currentTarget.value })}
              placeholder="Add description..."
              value={draft.description ?? ""}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {assigneeSections.length > 0 ? (
            <PropertyPicker
              onValueChange={(nextValue) =>
                updateDraft({ assignee: typeof nextValue === "string" ? nextValue : null })
              }
              placeholder={resolvedAssigneeLabel}
              sections={assigneeSections}
              value={draft.assignee ?? null}
              widthClassName="w-[280px]"
            />
          ) : null}
          {prioritySections.length > 0 ? (
            <PropertyPicker
              onValueChange={(nextValue) =>
                updateDraft({ priority: typeof nextValue === "string" ? nextValue : null })
              }
              placeholder={priorityLabel}
              sections={prioritySections}
              value={draft.priority ?? null}
              widthClassName="w-[280px]"
            />
          ) : null}
          {statusSections.length > 0 ? (
            <PropertyPicker
              onValueChange={(nextValue) =>
                updateDraft({ status: typeof nextValue === "string" ? nextValue : null })
              }
              placeholder={statusLabel}
              sections={statusSections}
              triggerIcon={<Circle aria-hidden className="size-4" />}
              value={draft.status ?? null}
              widthClassName="w-[280px]"
            />
          ) : null}
          {onMore ? (
            <IconButton
              icon={<MoreHorizontal aria-hidden className="size-4" />}
              label="More sub-issue properties"
              onClick={onMore}
              size="sm"
              title="More sub-issue properties"
            />
          ) : null}
          <span className="flex-1" />
          {onAttach ? (
            <IconButton
              icon={<Paperclip aria-hidden className="size-4" />}
              label="Attach file"
              onClick={onAttach}
              size="sm"
              title="Attach file"
            />
          ) : null}
          {onCancel ? (
            <Button onClick={onCancel} variant="ghost">
              {cancelLabel}
            </Button>
          ) : null}
          {onSubmit ? (
            <Button disabled={createDisabled} type="submit">
              {submitLabel}
            </Button>
          ) : null}
        </div>
      </form>
    );
  },
);
