import type { ThreadItem } from "@openai/codex-sdk";

export const makeCodexStreamState = () => {
  const itemsById = new Map<string, ThreadItem>();
  const itemOrder: Array<string> = [];
  const messageTextByItemId = new Map<string, string>();
  const messageOrder: Array<string> = [];

  const orderedItems = (): readonly ThreadItem[] =>
    itemOrder.flatMap((itemId) => {
      const item = itemsById.get(itemId);
      return item === undefined ? [] : [item];
    });

  const finalText = (): string =>
    messageOrder
      .map((itemId) => messageTextByItemId.get(itemId) ?? "")
      .filter((text) => text.length > 0)
      .join("\n\n");

  const recordItem = (item: ThreadItem): void => {
    if (!itemsById.has(item.id)) itemOrder.push(item.id);
    itemsById.set(item.id, item);
  };

  const textDeltaFromItem = (
    item: Extract<ThreadItem, { readonly type: "agent_message" }>,
  ):
    | {
        readonly delta: string;
        readonly snapshot: string;
      }
    | undefined => {
    if (!messageTextByItemId.has(item.id)) messageOrder.push(item.id);
    const previous = messageTextByItemId.get(item.id) ?? "";
    const next = item.text;
    messageTextByItemId.set(item.id, next);

    if (next.length <= previous.length || !next.startsWith(previous)) {
      return next === previous ? undefined : { delta: next, snapshot: finalText() };
    }

    const delta = next.slice(previous.length);
    return delta.length === 0 ? undefined : { delta, snapshot: finalText() };
  };

  return {
    finalText,
    orderedItems,
    recordItem,
    textDeltaFromItem,
  };
};
