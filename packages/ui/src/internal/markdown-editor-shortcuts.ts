export type MarkdownEditorShortcut = "link" | "submit";

export type MarkdownEditorShortcutEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "isComposing" | "key" | "metaKey" | "shiftKey"
>;

export const getMarkdownEditorShortcut = (
  event: MarkdownEditorShortcutEvent,
): MarkdownEditorShortcut | undefined => {
  if (event.isComposing || (!event.ctrlKey && !event.metaKey) || event.altKey || event.shiftKey) {
    return undefined;
  }

  const key = event.key.toLowerCase();

  if (key === "enter") return "submit";
  if (key === "k") return "link";

  return undefined;
};
