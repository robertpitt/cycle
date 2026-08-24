import type { PageDocument } from "@cycle/contracts/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  cycleApiClient,
  type ArchivePageRequest,
  type CreatePageRequest,
  type RestorePageRequest,
  type UpdatePageRequest,
} from "../lib/cycleApiClient.ts";
import {
  pageCommentsQueryKey,
  pageDetailQueryKey,
  pageHistoryQueryKey,
  pageListRootQueryKey,
} from "../queries/pages.ts";

export const usePageMutations = (repositoryId: string | undefined, pageId: string | undefined) => {
  const queryClient = useQueryClient();

  const invalidatePage = (targetPageId = pageId) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: pageListRootQueryKey }),
      queryClient.invalidateQueries({ queryKey: pageDetailQueryKey(repositoryId, targetPageId) }),
      queryClient.invalidateQueries({ queryKey: pageHistoryQueryKey(repositoryId, targetPageId) }),
    ]);

  const publishPage = (page: PageDocument) => {
    queryClient.setQueryData(pageDetailQueryKey(repositoryId, page.id), page);
    return invalidatePage(page.id);
  };

  const create = useMutation({
    mutationFn: (input: CreatePageRequest) => {
      if (!repositoryId) throw new Error("Choose a repository before creating a Page.");
      return cycleApiClient.createPage(repositoryId, input);
    },
    onSuccess: publishPage,
  });

  const update = useMutation({
    mutationFn: (input: UpdatePageRequest) => {
      if (!repositoryId) throw new Error("Choose a repository before saving a Page.");
      return cycleApiClient.updatePage(repositoryId, input);
    },
    onSuccess: publishPage,
  });

  const archive = useMutation({
    mutationFn: (input: ArchivePageRequest) => {
      if (!repositoryId) throw new Error("Choose a repository before archiving a Page.");
      return cycleApiClient.archivePage(repositoryId, input);
    },
    onSuccess: publishPage,
  });

  const restore = useMutation({
    mutationFn: (input: RestorePageRequest) => {
      if (!repositoryId) throw new Error("Choose a repository before restoring a Page.");
      return cycleApiClient.restorePage(repositoryId, input);
    },
    onSuccess: publishPage,
  });

  const addComment = useMutation({
    mutationFn: (body: string) => {
      if (!repositoryId || !pageId) throw new Error("Choose a Page before commenting.");
      if (body.trim().length === 0) throw new Error("Enter a comment before sending.");
      return cycleApiClient.addPageComment(repositoryId, pageId, body.trim());
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: pageCommentsQueryKey(repositoryId, pageId) }),
  });

  return { addComment, archive, create, restore, update } as const;
};
