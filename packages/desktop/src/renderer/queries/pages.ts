import { useQuery } from "@tanstack/react-query";
import type {
  CommentPage,
  PageDocument,
  PageHistoryPage,
  PagePage,
} from "@cycle/contracts/schemas";
import { cycleApiClient } from "../lib/cycleApiClient.ts";

export const pageListRootQueryKey = ["desktop", "api", "pages"] as const;

export const pageListQueryKey = (repositoryId: string | undefined) =>
  [...pageListRootQueryKey, repositoryId] as const;

export const pageDetailQueryKey = (repositoryId: string | undefined, pageId: string | undefined) =>
  ["desktop", "api", "page", repositoryId, pageId] as const;

export const pageHistoryQueryKey = (repositoryId: string | undefined, pageId: string | undefined) =>
  ["desktop", "api", "pageHistory", repositoryId, pageId] as const;

export const pageCommentsQueryKey = (
  repositoryId: string | undefined,
  pageId: string | undefined,
) => ["desktop", "api", "pageComments", repositoryId, pageId] as const;

const pageLimit = 100;

type CursorPage<Entry> = {
  readonly entries: ReadonlyArray<Entry>;
  readonly nextCursor?: string;
};

const collectCursorPages = async <Entry>(
  read: (cursor: string | undefined) => Promise<CursorPage<Entry>>,
): Promise<ReadonlyArray<Entry>> => {
  const entries: Entry[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  do {
    const result = await read(cursor);
    entries.push(...result.entries);
    cursor = result.nextCursor;
    if (cursor !== undefined && seenCursors.has(cursor)) {
      throw new Error("Cycle API repeated a Page pagination cursor.");
    }
    if (cursor !== undefined) seenCursors.add(cursor);
  } while (cursor !== undefined);

  return entries;
};

const listAllPages = async (repositoryId: string): Promise<PagePage> => {
  const entries = await collectCursorPages((cursor) =>
    cycleApiClient.listPages(repositoryId, { archived: "include", cursor, limit: pageLimit }),
  );
  return { entries };
};

export const usePageListQuery = (repositoryId: string | undefined) =>
  useQuery<PagePage>({
    enabled: repositoryId !== undefined,
    queryFn: () => {
      if (!repositoryId) throw new Error("Choose a repository before loading Pages.");
      return listAllPages(repositoryId);
    },
    queryKey: pageListQueryKey(repositoryId),
  });

export const usePageDetailQuery = (repositoryId: string | undefined, pageId: string | undefined) =>
  useQuery<PageDocument | null>({
    enabled: repositoryId !== undefined && pageId !== undefined,
    queryFn: () => {
      if (!repositoryId || !pageId) throw new Error("Choose a Page before loading it.");
      return cycleApiClient.getPage(repositoryId, pageId, true);
    },
    queryKey: pageDetailQueryKey(repositoryId, pageId),
  });

export const usePageHistoryQuery = (repositoryId: string | undefined, pageId: string | undefined) =>
  useQuery<PageHistoryPage>({
    enabled: repositoryId !== undefined && pageId !== undefined,
    queryFn: () => {
      if (!repositoryId || !pageId) throw new Error("Choose a Page before loading its history.");
      return collectCursorPages((cursor) =>
        cycleApiClient.listPageHistory(repositoryId, pageId, { cursor, limit: pageLimit }),
      ).then((entries): PageHistoryPage => ({ entries }));
    },
    queryKey: pageHistoryQueryKey(repositoryId, pageId),
  });

export const usePageCommentsQuery = (
  repositoryId: string | undefined,
  pageId: string | undefined,
) =>
  useQuery<CommentPage>({
    enabled: repositoryId !== undefined && pageId !== undefined,
    queryFn: () => {
      if (!repositoryId || !pageId) throw new Error("Choose a Page before loading comments.");
      return collectCursorPages((cursor) =>
        cycleApiClient.listPageComments(repositoryId, pageId, { cursor, limit: pageLimit }),
      ).then((entries): CommentPage => ({ entries }));
    },
    queryKey: pageCommentsQueryKey(repositoryId, pageId),
  });
