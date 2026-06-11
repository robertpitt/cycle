import {
  AtSign,
  Bold,
  CheckSquare,
  ChevronDown,
  Code2,
  Eye,
  Heading,
  ImagePlus,
  Italic,
  Link,
  List,
  ListOrdered,
  MessageCircle,
  Paperclip,
  PencilLine,
  Pilcrow,
  Quote,
  Strikethrough,
  Underline,
} from "lucide-react";
import * as React from "react";
import { IconButton } from "../../atoms/icon-button/index.ts";
import { MarkdownRenderer } from "../../components/markdown-renderer/index.ts";
import { cn } from "../../lib/cn.ts";
import { focusRing, typography } from "../../lib/styles.ts";

export type IssueEditorCommand = {
  readonly description?: React.ReactNode;
  readonly icon?: React.ReactNode;
  readonly id: string;
  readonly label: React.ReactNode;
  readonly shortcut?: React.ReactNode;
};

export type IssueEditorCommandSection = {
  readonly commands: readonly IssueEditorCommand[];
  readonly id: string;
  readonly label?: React.ReactNode;
};

export type IssueEditorFormatAction =
  | "bold"
  | "code"
  | "comment"
  | "heading"
  | "italic"
  | "link"
  | "ordered-list"
  | "quote"
  | "strike"
  | "task-list"
  | "underline"
  | "unordered-list";

export type IssueEditorProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "defaultValue" | "onChange"
> & {
  readonly commandSections?: readonly IssueEditorCommandSection[];
  readonly defaultPreviewOpen?: boolean;
  readonly defaultSlashMenuOpen?: boolean;
  readonly defaultToolbarOpen?: boolean;
  readonly defaultValue?: string;
  readonly onAttach?: React.MouseEventHandler<HTMLButtonElement>;
  readonly onCommandSelect?: (command: IssueEditorCommand) => void;
  readonly onFormatSelect?: (action: IssueEditorFormatAction) => void;
  readonly onPreviewOpenChange?: (open: boolean) => void;
  readonly onSave?: (value: string) => void;
  readonly onValueChange?: (value: string) => void;
  readonly placeholder?: string;
  readonly previewOpen?: boolean;
  readonly slashMenuOpen?: boolean;
  readonly toolbarOpen?: boolean;
  readonly value?: string;
};

const defaultCommandSections: readonly IssueEditorCommandSection[] = [
  {
    commands: [
      {
        description: "Add a heading block",
        icon: <Heading aria-hidden className="size-4" />,
        id: "heading",
        label: "Heading",
        shortcut: "#",
      },
      {
        description: "Start a bulleted list",
        icon: <List aria-hidden className="size-4" />,
        id: "bulleted-list",
        label: "Bulleted list",
        shortcut: "-",
      },
      {
        description: "Track completion inline",
        icon: <CheckSquare aria-hidden className="size-4" />,
        id: "todo-list",
        label: "Todo list",
        shortcut: "[]",
      },
    ],
    id: "blocks",
    label: "Blocks",
  },
  {
    commands: [
      {
        description: "Mention a person or team",
        icon: <AtSign aria-hidden className="size-4" />,
        id: "mention",
        label: "Mention",
        shortcut: "@",
      },
      {
        description: "Attach an image",
        icon: <ImagePlus aria-hidden className="size-4" />,
        id: "image",
        label: "Image",
      },
      {
        description: "Insert code block",
        icon: <Code2 aria-hidden className="size-4" />,
        id: "code",
        label: "Code block",
        shortcut: "```",
      },
    ],
    id: "insert",
    label: "Insert",
  },
];

const formatActions: readonly {
  readonly action: IssueEditorFormatAction;
  readonly icon: React.ReactNode;
  readonly label: string;
}[] = [
  {
    action: "heading",
    icon: (
      <>
        <span className={typography.panelTitle}>Aa</span>
        <ChevronDown aria-hidden className="size-3" />
      </>
    ),
    label: "Text style",
  },
  {
    action: "bold",
    icon: <Bold aria-hidden className="size-4" />,
    label: "Bold",
  },
  {
    action: "italic",
    icon: <Italic aria-hidden className="size-4" />,
    label: "Italic",
  },
  {
    action: "strike",
    icon: <Strikethrough aria-hidden className="size-4" />,
    label: "Strikethrough",
  },
  {
    action: "underline",
    icon: <Underline aria-hidden className="size-4" />,
    label: "Underline",
  },
  {
    action: "link",
    icon: <Link aria-hidden className="size-4" />,
    label: "Link",
  },
  {
    action: "quote",
    icon: <Quote aria-hidden className="size-4" />,
    label: "Quote",
  },
  {
    action: "code",
    icon: <Code2 aria-hidden className="size-4" />,
    label: "Code",
  },
  {
    action: "unordered-list",
    icon: <List aria-hidden className="size-4" />,
    label: "Bulleted list",
  },
  {
    action: "ordered-list",
    icon: <ListOrdered aria-hidden className="size-4" />,
    label: "Numbered list",
  },
  {
    action: "task-list",
    icon: <CheckSquare aria-hidden className="size-4" />,
    label: "Task list",
  },
  {
    action: "comment",
    icon: <MessageCircle aria-hidden className="size-4" />,
    label: "Comment",
  },
];

const useControllableText = ({
  defaultValue = "",
  onValueChange,
  value,
}: Pick<IssueEditorProps, "defaultValue" | "onValueChange" | "value">) => {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : uncontrolledValue;

  const setValue = React.useCallback(
    (nextValue: string) => {
      if (!isControlled) {
        setUncontrolledValue(nextValue);
      }
      onValueChange?.(nextValue);
    },
    [isControlled, onValueChange],
  );

  return [currentValue, setValue] as const;
};

const useControllableOpen = ({
  defaultOpen = false,
  open,
}: {
  readonly defaultOpen?: boolean;
  readonly open?: boolean;
}) => {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  return [open ?? uncontrolledOpen, setUncontrolledOpen] as const;
};

type MarkdownEdit = {
  readonly nextValue: string;
  readonly selectionEnd: number;
  readonly selectionStart: number;
};

const replaceSelection = (
  value: string,
  selectionStart: number,
  selectionEnd: number,
  replacement: string,
  cursorStart = selectionStart + replacement.length,
  cursorEnd = cursorStart,
): MarkdownEdit => ({
  nextValue: `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`,
  selectionEnd: cursorEnd,
  selectionStart: cursorStart,
});

const wrapSelection = (
  value: string,
  selectionStart: number,
  selectionEnd: number,
  prefix: string,
  suffix = prefix,
  placeholder = "text",
): MarkdownEdit => {
  const selected = value.slice(selectionStart, selectionEnd) || placeholder;
  const replacement = `${prefix}${selected}${suffix}`;
  const start = selectionStart + prefix.length;

  return replaceSelection(
    value,
    selectionStart,
    selectionEnd,
    replacement,
    start,
    start + selected.length,
  );
};

const prefixSelectedLines = (
  value: string,
  selectionStart: number,
  selectionEnd: number,
  prefix: string,
  placeholder = "List item",
): MarkdownEdit => {
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const nextLine = value.indexOf("\n", selectionEnd);
  const lineEnd = nextLine === -1 ? value.length : nextLine;
  const block = value.slice(lineStart, lineEnd) || placeholder;
  const replacement = block
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");

  return replaceSelection(
    value,
    lineStart,
    lineEnd,
    replacement,
    lineStart,
    lineStart + replacement.length,
  );
};

const applyMarkdownAction = (
  value: string,
  selectionStart: number,
  selectionEnd: number,
  action: IssueEditorFormatAction,
): MarkdownEdit => {
  const selected = value.slice(selectionStart, selectionEnd);

  switch (action) {
    case "bold":
      return wrapSelection(value, selectionStart, selectionEnd, "**");
    case "code":
      return selected.includes("\n")
        ? wrapSelection(value, selectionStart, selectionEnd, "```\n", "\n```", "code")
        : wrapSelection(value, selectionStart, selectionEnd, "`", "`", "code");
    case "comment":
      return wrapSelection(value, selectionStart, selectionEnd, "<!-- ", " -->", "comment");
    case "heading":
      return prefixSelectedLines(value, selectionStart, selectionEnd, "## ", "Heading");
    case "italic":
      return wrapSelection(value, selectionStart, selectionEnd, "*");
    case "link":
      return wrapSelection(
        value,
        selectionStart,
        selectionEnd,
        "[",
        "](https://example.com)",
        "link",
      );
    case "ordered-list":
      return prefixSelectedLines(value, selectionStart, selectionEnd, "1. ");
    case "quote":
      return prefixSelectedLines(value, selectionStart, selectionEnd, "> ", "Quote");
    case "strike":
      return wrapSelection(value, selectionStart, selectionEnd, "~~");
    case "task-list":
      return prefixSelectedLines(value, selectionStart, selectionEnd, "- [ ] ");
    case "underline":
      return wrapSelection(value, selectionStart, selectionEnd, "<u>", "</u>");
    case "unordered-list":
      return prefixSelectedLines(value, selectionStart, selectionEnd, "- ");
  }
};

const commandTemplate = (command: IssueEditorCommand): string => {
  switch (command.id) {
    case "heading":
      return "## ";
    case "bulleted-list":
      return "- ";
    case "todo-list":
      return "- [ ] ";
    case "code":
      return "```\n\n```";
    case "mention":
      return "@";
    case "image":
      return "![alt text](image-url)";
    default:
      return "";
  }
};

export const IssueEditorToolbar = ({
  className,
  onFormatSelect,
}: {
  readonly className?: string;
  readonly onFormatSelect?: (action: IssueEditorFormatAction) => void;
}) => (
  <div
    className={cn(
      "inline-flex items-center gap-1 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-elevated",
      className,
    )}
    role="toolbar"
  >
    {formatActions.map((item, index) => (
      <React.Fragment key={item.action}>
        {index === 8 ? <span aria-hidden className="mx-1 h-6 w-px bg-border" /> : null}
        <button
          aria-label={item.label}
          className={cn(
            "inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-md px-2 text-muted-foreground transition hover:bg-subtle hover:text-foreground",
            focusRing,
          )}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onFormatSelect?.(item.action)}
          type="button"
        >
          {item.icon}
        </button>
      </React.Fragment>
    ))}
  </div>
);

export const IssueEditorSlashMenu = ({
  className,
  onCommandSelect,
  sections = defaultCommandSections,
}: {
  readonly className?: string;
  readonly onCommandSelect?: (command: IssueEditorCommand) => void;
  readonly sections?: readonly IssueEditorCommandSection[];
}) => (
  <div
    className={cn(
      "w-[320px] overflow-hidden rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-elevated",
      className,
    )}
    role="menu"
  >
    <div className="flex items-center gap-2 border-b border-border px-2 pb-2">
      <Pilcrow aria-hidden className="size-4 text-muted-foreground" />
      <span className={cn(typography.control, "text-muted-foreground")}>Insert block</span>
    </div>
    <div className="grid gap-2 pt-2">
      {sections.map((section) => (
        <div className="grid gap-1" key={section.id}>
          {section.label ? (
            <p className={cn("px-2 py-1 uppercase text-muted-foreground", typography.meta)}>
              {section.label}
            </p>
          ) : null}
          {section.commands.map((command) => (
            <button
              className={cn(
                "grid min-h-12 grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 text-left transition hover:bg-subtle",
                focusRing,
              )}
              key={command.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onCommandSelect?.(command)}
              role="menuitem"
              type="button"
            >
              <span className="grid size-7 place-items-center rounded-md bg-subtle text-muted-foreground">
                {command.icon}
              </span>
              <span className="min-w-0">
                <span className={cn("block truncate text-foreground", typography.control)}>
                  {command.label}
                </span>
                {command.description ? (
                  <span className={cn("block truncate text-muted-foreground", typography.meta)}>
                    {command.description}
                  </span>
                ) : null}
              </span>
              {command.shortcut ? (
                <span className={cn("text-muted-foreground", typography.meta)}>
                  {command.shortcut}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ))}
    </div>
  </div>
);

export const IssueEditor = React.forwardRef<HTMLDivElement, IssueEditorProps>(function IssueEditor(
  {
    className,
    commandSections,
    defaultPreviewOpen = false,
    defaultSlashMenuOpen = false,
    defaultToolbarOpen = false,
    defaultValue,
    onAttach,
    onCommandSelect,
    onFormatSelect,
    onPreviewOpenChange,
    onSave,
    onValueChange,
    placeholder = "Add description...",
    previewOpen,
    slashMenuOpen,
    toolbarOpen,
    value,
    ...props
  },
  ref,
) {
  const editorRef = React.useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = React.useState(false);
  const [currentValue, setValue] = useControllableText({
    defaultValue,
    onValueChange,
    value,
  });
  const [selectionToolbarOpen, setSelectionToolbarOpen] = useControllableOpen({
    defaultOpen: defaultToolbarOpen,
    open: toolbarOpen,
  });
  const [commandMenuOpen, setCommandMenuOpen] = useControllableOpen({
    defaultOpen: defaultSlashMenuOpen,
    open: slashMenuOpen,
  });
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

  const syncValue = React.useCallback(
    (nextValue: string) => {
      setValue(nextValue);
      if (slashMenuOpen === undefined) {
        setCommandMenuOpen(nextValue.trimEnd().endsWith("/"));
      }
    },
    [setCommandMenuOpen, setValue, slashMenuOpen],
  );

  const applyEdit = React.useCallback(
    (edit: MarkdownEdit) => {
      setValue(edit.nextValue);
      requestAnimationFrame(() => {
        editorRef.current?.focus();
        editorRef.current?.setSelectionRange(edit.selectionStart, edit.selectionEnd);
      });
    },
    [setValue],
  );

  const handleFormatSelect = React.useCallback(
    (action: IssueEditorFormatAction) => {
      const editor = editorRef.current;
      const selectionStart = editor?.selectionStart ?? currentValue.length;
      const selectionEnd = editor?.selectionEnd ?? currentValue.length;

      applyEdit(applyMarkdownAction(currentValue, selectionStart, selectionEnd, action));
      onFormatSelect?.(action);
    },
    [applyEdit, currentValue, onFormatSelect],
  );

  const showToolbar =
    !currentPreviewOpen && (focused || selectionToolbarOpen || toolbarOpen === true);

  return (
    <div {...props} ref={ref} className={cn("relative grid gap-3", className)}>
      {showToolbar ? (
        <IssueEditorToolbar
          className="absolute -top-14 left-0 z-20"
          onFormatSelect={handleFormatSelect}
        />
      ) : null}
      {currentPreviewOpen ? (
        <MarkdownRenderer
          className="min-h-[140px] rounded-md border border-transparent px-1 py-2"
          markdown={currentValue}
        />
      ) : (
        <textarea
          ref={editorRef}
          aria-label={placeholder}
          className={cn(
            "min-h-[140px] resize-y rounded-md border border-transparent bg-transparent px-1 py-2 text-foreground outline-none transition hover:bg-subtle/35 focus:border-border focus:bg-subtle/45",
            "placeholder:text-muted-foreground/70",
            focusRing,
            typography.body,
          )}
          onBlur={() => {
            setFocused(false);
            onSave?.(currentValue);
          }}
          onChange={(event) => syncValue(event.currentTarget.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={(event) => {
            if (event.key === "/" && slashMenuOpen === undefined) {
              setCommandMenuOpen(true);
            }
            if (event.key === "Escape" && slashMenuOpen === undefined) {
              setCommandMenuOpen(false);
            }
          }}
          onSelect={(event) => {
            if (toolbarOpen !== undefined) return;
            const target = event.currentTarget;
            setSelectionToolbarOpen(target.selectionStart !== target.selectionEnd);
          }}
          placeholder={placeholder}
          value={currentValue}
        />
      )}
      <div className="flex items-center gap-2">
        <IconButton
          icon={<AtSign aria-hidden className="size-4" />}
          label="Mention"
          size="sm"
          title="Mention"
        />
        <IconButton
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
      {commandMenuOpen ? (
        <IssueEditorSlashMenu
          className="absolute left-2 top-[calc(100%-2.5rem)] z-20"
          onCommandSelect={(command) => {
            const editor = editorRef.current;
            const selectionStart = editor?.selectionStart ?? currentValue.length;
            const selectionEnd = editor?.selectionEnd ?? currentValue.length;
            const template = commandTemplate(command);
            const startsAt = currentValue.slice(0, selectionStart).trimEnd().endsWith("/")
              ? selectionStart - 1
              : selectionStart;

            if (template.length > 0) {
              applyEdit(replaceSelection(currentValue, startsAt, selectionEnd, template));
            }
            onCommandSelect?.(command);
            if (slashMenuOpen === undefined) {
              setCommandMenuOpen(false);
            }
          }}
          sections={commandSections}
        />
      ) : null}
    </div>
  );
});
