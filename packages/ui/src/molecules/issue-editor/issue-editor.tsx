import { AtSign, Eye, Paperclip, PencilLine } from "lucide-react";
import * as React from "react";
import { IconButton } from "../../atoms/icon-button/index.ts";
import type { MarkdownReferenceHandlers } from "../markdown-renderer/index.ts";
import { cn } from "../../lib/cn.ts";
import { focusRing, typography } from "../../lib/styles.ts";
import {
  MarkdownEditor,
  MarkdownEditorSlashMenu,
  MarkdownEditorToolbar,
  type MarkdownEditorCommand,
  type MarkdownEditorCommandSection,
  type MarkdownEditorFormatAction,
  type MarkdownEditorTagSuggestion,
} from "../markdown-editor/index.ts";

export type IssueEditorCommand = MarkdownEditorCommand;
export type IssueEditorCommandSection = MarkdownEditorCommandSection;
export type IssueEditorFormatAction = MarkdownEditorFormatAction;
export type IssueEditorTagSuggestion = MarkdownEditorTagSuggestion;

export type IssueEditorProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "defaultValue" | "onChange"
> &
  MarkdownReferenceHandlers & {
    readonly commandSections?: readonly IssueEditorCommandSection[];
    readonly defaultPreviewOpen?: boolean;
    readonly defaultSlashMenuOpen?: boolean;
    readonly defaultToolbarOpen?: boolean;
    readonly defaultValue?: string;
    readonly disabled?: boolean;
    readonly onAttach?: React.MouseEventHandler<HTMLButtonElement>;
    readonly onCommandSelect?: (command: IssueEditorCommand) => void;
    readonly onFormatSelect?: (action: IssueEditorFormatAction) => void;
    readonly onMention?: React.MouseEventHandler<HTMLButtonElement>;
    readonly onPreviewOpenChange?: (open: boolean) => void;
    readonly onSave?: (value: string) => void;
    readonly onTagQueryChange?: (query: string) => void;
    readonly onTagSelect?: (suggestion: IssueEditorTagSuggestion) => void;
    readonly onValueChange?: (value: string) => void;
    readonly placeholder?: string;
    readonly previewOpen?: boolean;
    readonly readOnly?: boolean;
    readonly slashMenuOpen?: boolean;
    readonly tagSuggestions?: readonly IssueEditorTagSuggestion[];
    readonly toolbarOpen?: boolean;
    readonly value?: string;
  };

export const IssueEditorToolbar = MarkdownEditorToolbar;
export const IssueEditorSlashMenu = MarkdownEditorSlashMenu;

export const IssueEditor = React.forwardRef<HTMLDivElement, IssueEditorProps>(function IssueEditor(
  {
    className,
    commandSections,
    defaultPreviewOpen = false,
    defaultSlashMenuOpen = false,
    defaultToolbarOpen = false,
    defaultValue,
    disabled = false,
    onAgentReferenceClick,
    onAttach,
    onCommandSelect,
    onCommitReferenceClick,
    onCycleReferenceClick,
    onExternalLinkClick,
    onFormatSelect,
    onMention,
    onIssueReferenceClick,
    onPreviewOpenChange,
    onRepositoryReferenceClick,
    onSave,
    onTagQueryChange,
    onTagSelect,
    onUserReferenceClick,
    onValueChange,
    placeholder = "Add description...",
    previewOpen,
    readOnly = false,
    slashMenuOpen,
    tagSuggestions,
    toolbarOpen,
    value,
    ...props
  },
  ref,
) {
  const [uncontrolledPreviewOpen, setUncontrolledPreviewOpen] = React.useState(defaultPreviewOpen);
  const currentPreviewOpen = previewOpen ?? uncontrolledPreviewOpen;

  const setPreviewOpen = React.useCallback(
    (open: boolean) => {
      if (previewOpen === undefined) {
        setUncontrolledPreviewOpen(open);
      }
      onPreviewOpenChange?.(open);
    },
    [onPreviewOpenChange, previewOpen],
  );

  return (
    <div {...props} ref={ref} className={cn("relative grid gap-3", className)}>
      <MarkdownEditor
        aria-label={placeholder}
        commandSections={commandSections}
        commitOnBlur
        defaultSlashMenuOpen={defaultSlashMenuOpen}
        defaultToolbarOpen={defaultToolbarOpen}
        defaultValue={defaultValue}
        disabled={disabled}
        mode="ticket"
        onAgentReferenceClick={onAgentReferenceClick}
        onCommandSelect={onCommandSelect}
        onCommitReferenceClick={onCommitReferenceClick}
        onCommit={onSave}
        onCycleReferenceClick={onCycleReferenceClick}
        onExternalLinkClick={onExternalLinkClick}
        onFormatSelect={onFormatSelect}
        onIssueReferenceClick={onIssueReferenceClick}
        onRepositoryReferenceClick={onRepositoryReferenceClick}
        onTagQueryChange={onTagQueryChange}
        onTagSelect={onTagSelect}
        onUserReferenceClick={onUserReferenceClick}
        onValueChange={onValueChange}
        placeholder={placeholder}
        previewOpen={currentPreviewOpen}
        readOnly={readOnly}
        slashMenuOpen={slashMenuOpen}
        tagSuggestions={tagSuggestions}
        toolbarOpen={toolbarOpen}
        value={value}
      />
      <div className="flex items-center gap-2">
        {onMention ? (
          <IconButton
            disabled={disabled || readOnly}
            icon={<AtSign aria-hidden className="size-4" />}
            label="Mention"
            onClick={onMention}
            size="sm"
            title="Mention"
          />
        ) : null}
        {onAttach ? (
          <IconButton
            disabled={disabled || readOnly}
            icon={<Paperclip aria-hidden className="size-4" />}
            label="Attach file"
            onClick={onAttach}
            size="sm"
            title="Attach file"
          />
        ) : null}
        <span className="flex-1" />
        <button
          className={cn(
            "inline-flex h-8 items-center gap-2 rounded-md px-2 text-muted-foreground transition hover:bg-subtle hover:text-foreground",
            focusRing,
            typography.control,
          )}
          onClick={() => setPreviewOpen(!currentPreviewOpen)}
          type="button"
        >
          {currentPreviewOpen ? (
            <PencilLine aria-hidden className="size-4" />
          ) : (
            <Eye aria-hidden className="size-4" />
          )}
          {currentPreviewOpen ? "Edit" : "Preview"}
        </button>
      </div>
    </div>
  );
});
