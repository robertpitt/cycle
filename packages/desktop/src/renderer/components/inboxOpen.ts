import type { InboxMutationInput } from "@cycle/contracts";
import type { InboxListEntry } from "@cycle/ui/organisms";

export const markReadInputForOpenedInboxEntry = (
  entry: Pick<InboxListEntry, "itemId" | "status">,
  userId: string,
): InboxMutationInput | undefined => {
  if (entry.status !== "unread") return undefined;

  return {
    itemIds: [entry.itemId],
    userId,
  };
};
