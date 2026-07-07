import type { InboxMutationInput, InboxMutationResult, InboxStatus } from "@cycle/backend/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cycleApiClient } from "../lib/cycleApiClient.ts";
import { inboxRootQueryKey } from "../queries/inbox.ts";

type InboxMutationKind = "archive" | "markRead" | "markUnread";

type InboxMutationOptions = {
  readonly kind: InboxMutationKind;
};

export const useInboxMutation = ({ kind }: InboxMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: InboxMutationInput): Promise<InboxMutationResult> => {
      switch (kind) {
        case "archive":
          return cycleApiClient.call("inbox.archive", input);
        case "markRead":
          return cycleApiClient.call("inbox.markRead", input);
        case "markUnread":
          return cycleApiClient.call("inbox.markUnread", input);
      }
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: inboxRootQueryKey,
      }),
  });
};

export const statusForInboxMutationKind = (kind: InboxMutationKind): InboxStatus =>
  kind === "archive" ? "archived" : kind === "markRead" ? "read" : "unread";
