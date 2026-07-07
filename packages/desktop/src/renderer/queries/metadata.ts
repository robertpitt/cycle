import { useQueries, useQuery } from "@tanstack/react-query";
import type {
  InitiativeProgress,
  IssueTemplateDocument,
  IssueTemplatePage,
  IssueTemplateQuery,
  LabelDefinitionDocument,
  LabelDefinitionPage,
  LabelDefinitionQuery,
  SavedViewDocument,
  SavedViewPage,
  SavedViewQuery,
  UserProfileDocument,
  UserProfilePage,
  UserProfileQuery,
} from "@cycle/backend/client";
import { cycleApiClient } from "../lib/cycleApiClient.ts";
import { normalizeCreateTicketType } from "../lib/ticketTypes.ts";

const usersQueryKey = (repositoryId: string | undefined) =>
  ["desktop", "api", "users", repositoryId] as const;

const userListQueryKey = (repositoryId: string | undefined, query: UserProfileQuery = {}) =>
  [...usersQueryKey(repositoryId), "list", query] as const;

const labelsQueryKey = (repositoryId: string | undefined) =>
  ["desktop", "api", "labels", repositoryId] as const;

const labelListQueryKey = (repositoryId: string | undefined, query: LabelDefinitionQuery = {}) =>
  [...labelsQueryKey(repositoryId), "list", query] as const;

export const viewsQueryKey = (repositoryId: string | undefined) =>
  ["desktop", "api", "views", repositoryId] as const;

const viewListQueryKey = (repositoryId: string | undefined, query: SavedViewQuery = {}) =>
  [...viewsQueryKey(repositoryId), "list", query] as const;

const viewDetailQueryKey = (repositoryId: string | undefined, viewId: string | undefined) =>
  [...viewsQueryKey(repositoryId), "detail", viewId] as const;

const templatesQueryKey = (repositoryId: string | undefined) =>
  ["desktop", "api", "templates", repositoryId] as const;

const templateListQueryKey = (repositoryId: string | undefined, query: IssueTemplateQuery = {}) =>
  [...templatesQueryKey(repositoryId), "list", query] as const;

const initiativeProgressQueryKey = (
  repositoryId: string | undefined,
  initiativeId: string | undefined,
) => ["desktop", "api", "initiativeProgress", repositoryId, initiativeId] as const;

const normalizeRepositoryIds = (repositoryIds: readonly string[] | undefined) =>
  repositoryIds === undefined ? [] : [...new Set(repositoryIds)].sort();

const listUsersForRepository = async (
  repositoryId: string,
  query: UserProfileQuery = {},
): Promise<UserProfilePage> =>
  cycleApiClient.call("ticket.user.list", {
    input: query,
    repository: {
      id: repositoryId,
    },
  });

const listLabelsForRepository = async (
  repositoryId: string,
  query: LabelDefinitionQuery = {},
): Promise<LabelDefinitionPage> =>
  cycleApiClient.call("ticket.label.list", {
    input: query,
    repository: {
      id: repositoryId,
    },
  });

const listViewsForRepository = async (
  repositoryId: string,
  query: SavedViewQuery = {},
): Promise<SavedViewPage> =>
  cycleApiClient.call("ticket.view.list", {
    input: query,
    repository: {
      id: repositoryId,
    },
  });

const getViewForRepository = async ({
  repositoryId,
  viewId,
}: {
  readonly repositoryId: string;
  readonly viewId: string;
}): Promise<SavedViewDocument | null> =>
  cycleApiClient.call("ticket.view.get", {
    input: {
      id: viewId,
    },
    repository: {
      id: repositoryId,
    },
  });

const listTemplatesForRepository = async (
  repositoryId: string,
  query: IssueTemplateQuery = {},
): Promise<IssueTemplatePage> => {
  const page = await cycleApiClient.call("ticket.template.list", {
    input: query,
    repository: {
      id: repositoryId,
    },
  });

  return {
    ...page,
    entries: page.entries.map(normalizeTemplateTypeDefault),
  };
};

const normalizeTemplateTypeDefault = <
  TTemplate extends {
    readonly defaults?: { readonly type?: string };
  },
>(
  template: TTemplate,
): IssueTemplateDocument => {
  const type = normalizeCreateTicketType(template.defaults?.type);
  if (!template.defaults || template.defaults.type === type) {
    return template as unknown as IssueTemplateDocument;
  }

  const { type: _type, ...defaults } = template.defaults;
  return {
    ...template,
    defaults: type === undefined ? defaults : { ...defaults, type },
  } as unknown as IssueTemplateDocument;
};

const getInitiativeProgressForRepository = async ({
  initiativeId,
  repositoryId,
}: {
  readonly initiativeId: string;
  readonly repositoryId: string;
}): Promise<InitiativeProgress> =>
  cycleApiClient.call("ticket.initiative.progress", {
    input: {
      id: initiativeId,
    },
    repository: {
      id: repositoryId,
    },
  });

export const useUserListQuery = (repositoryId: string | undefined, query: UserProfileQuery = {}) =>
  useQuery({
    enabled: repositoryId !== undefined,
    queryFn: () => {
      if (!repositoryId) {
        throw new Error("Choose a repository before loading users.");
      }

      return listUsersForRepository(repositoryId, query);
    },
    queryKey: userListQueryKey(repositoryId, query),
  });

export const useUserListsByRepositoryQuery = (
  repositoryIds: readonly string[] | undefined,
  query: UserProfileQuery = {},
) => {
  const normalizedRepositoryIds = normalizeRepositoryIds(repositoryIds);

  return useQueries({
    combine: (results) => {
      const data = new Map<string, readonly UserProfileDocument[]>();

      for (const [index, repositoryId] of normalizedRepositoryIds.entries()) {
        data.set(repositoryId, results[index]?.data?.entries ?? []);
      }

      return {
        data,
        error: results.find((result) => result.error)?.error ?? null,
        isError: results.some((result) => result.isError),
        isLoading: results.some((result) => result.isLoading),
      };
    },
    queries: normalizedRepositoryIds.map((repositoryId) => ({
      queryFn: () => listUsersForRepository(repositoryId, query),
      queryKey: userListQueryKey(repositoryId, query),
    })),
  });
};

export const useLabelListQuery = (
  repositoryId: string | undefined,
  query: LabelDefinitionQuery = {},
) =>
  useQuery({
    enabled: repositoryId !== undefined,
    queryFn: () => {
      if (!repositoryId) {
        throw new Error("Choose a repository before loading labels.");
      }

      return listLabelsForRepository(repositoryId, query);
    },
    queryKey: labelListQueryKey(repositoryId, query),
  });

export const useLabelListsByRepositoryQuery = (
  repositoryIds: readonly string[] | undefined,
  query: LabelDefinitionQuery = {},
) => {
  const normalizedRepositoryIds = normalizeRepositoryIds(repositoryIds);

  return useQueries({
    combine: (results) => {
      const data = new Map<string, readonly LabelDefinitionDocument[]>();

      for (const [index, repositoryId] of normalizedRepositoryIds.entries()) {
        data.set(repositoryId, results[index]?.data?.entries ?? []);
      }

      return {
        data,
        error: results.find((result) => result.error)?.error ?? null,
        isError: results.some((result) => result.isError),
        isLoading: results.some((result) => result.isLoading),
      };
    },
    queries: normalizedRepositoryIds.map((repositoryId) => ({
      queryFn: () => listLabelsForRepository(repositoryId, query),
      queryKey: labelListQueryKey(repositoryId, query),
    })),
  });
};

export const useSavedViewListQuery = (
  repositoryId: string | undefined,
  query: SavedViewQuery = {},
) =>
  useQuery({
    enabled: repositoryId !== undefined,
    queryFn: () => {
      if (!repositoryId) {
        throw new Error("Choose a repository before loading saved views.");
      }

      return listViewsForRepository(repositoryId, query);
    },
    queryKey: viewListQueryKey(repositoryId, query),
  });

export const useSavedViewDetailQuery = (
  repositoryId: string | undefined,
  viewId: string | undefined,
) =>
  useQuery({
    enabled: repositoryId !== undefined && viewId !== undefined,
    queryFn: () => {
      if (!repositoryId || !viewId) {
        throw new Error("Choose a saved view before loading view details.");
      }

      return getViewForRepository({
        repositoryId,
        viewId,
      });
    },
    queryKey: viewDetailQueryKey(repositoryId, viewId),
  });

export const useIssueTemplateListQuery = (
  repositoryId: string | undefined,
  query: IssueTemplateQuery = {},
) =>
  useQuery({
    enabled: repositoryId !== undefined,
    queryFn: () => {
      if (!repositoryId) {
        throw new Error("Choose a repository before loading issue templates.");
      }

      return listTemplatesForRepository(repositoryId, query);
    },
    queryKey: templateListQueryKey(repositoryId, query),
  });

export const useInitiativeProgressQuery = (
  repositoryId: string | undefined,
  initiativeId: string | undefined,
) =>
  useQuery({
    enabled: repositoryId !== undefined && initiativeId !== undefined,
    queryFn: () => {
      if (!repositoryId || !initiativeId) {
        throw new Error("Choose an initiative before loading progress.");
      }

      return getInitiativeProgressForRepository({
        initiativeId,
        repositoryId,
      });
    },
    queryKey: initiativeProgressQueryKey(repositoryId, initiativeId),
  });
