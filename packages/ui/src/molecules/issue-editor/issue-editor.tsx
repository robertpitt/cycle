import { AtSign, Eye, Paperclip, PencilLine } from "lucide-react";
import * as React from "react";
import { IconButton } from "../../atoms/icon-button/index.ts";
import { cn } from "../../lib/cn.ts";
import { focusRing, typography } from "../../lib/styles.ts";
import {
  MarkdownEditor,
  MarkdownEditorSlashMenu,
  MarkdownEditorToolbar,
  type MarkdownEditorCommand,
  type MarkdownEditorCommandSection,
  type MarkdownEditorFormatAction,
} from "../markdown-editor/index.ts";

export type IssueEditorCommand = MarkdownEditorCommand;
export type IssueEditorCommandSection = MarkdownEditorCommandSection;
export type IssueEditorFormatAction = MarkdownEditorFormatAction;

export type IssueEditorProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "defaultValue" | "onChange"
> & {
  readonly commandSections?: readonly IssueEditorCommandSection[];
  readonly defaultPreviewOpen?: boolean;
  readonly defaultSlashMenuOpen?: boolean;
  readonly defaultToolbarOpen?: boolean;
  readonly defaultValue?: string;
  readonly disabled?: boolean;
  readonly onAttach?: React.MouseEventHandler<HTMLButtonElement>;
  readonly onCommandSelect?: (command: IssueEditorCommand) => void;
  readonly onFormatSelect?: (action: IssueEditorFormatAction) => void;
  readonly onPreviewOpenChange?: (open: boolean) => void;
  readonly onSave?: (value: string) => void;
  readonly onValueChange?: (value: string) => void;
  readonly placeholder?: string;
  readonly previewOpen?: boolean;
  readonly readOnly?: boolean;
  readonly slashMenuOpen?: boolean;
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
    onAttach,
    onCommandSelect,
    onFormatSelect,
    onPreviewOpenChange,
    onSave,
    onValueChange,
    placeholder = "Add description...",
    previewOpen,
    readOnly = false,
    slashMenuOpen,
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
        onCommandSelect={onCommandSelect}
        onCommit={onSave}
        onFormatSelect={onFormatSelect}
        onValueChange={onValueChange}
        placeholder={placeholder}
        previewOpen={currentPreviewOpen}
        readOnly={readOnly}
        slashMenuOpen={slashMenuOpen}
        toolbarOpen={toolbarOpen}
        value={value}
      />
      <div className="flex items-center gap-2">
        <IconButton
          disabled={disabled || readOnly}
          icon={<AtSign aria-hidden className="size-4" />}
          label="Mention"
          size="sm"
          title="Mention"
        />
        <IconButton
          disabled={disabled || readOnly}
          icon={<Paperclip aria-hidden className="size-4" />}
          label="Attach file"
          onClick={onAttach}
          size="sm"
          title="Attach file"
        />
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
