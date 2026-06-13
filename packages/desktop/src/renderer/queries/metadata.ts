import { useQuery } from "@tanstack/react-query";
import type {
  InitiativeProgress,
  IssueTemplatePage,
  IssueTemplateQuery,
  LabelDefinitionPage,
  LabelDefinitionQuery,
  SavedViewDocument,
  SavedViewPage,
  SavedViewQuery,
  UserProfilePage,
  UserProfileQuery,
} from "@cycle/contracts";
import { getDesktopBridge } from "../lib/desktopBridge.ts";
import { ticketRpcClient } from "../lib/ticketRpcClient.ts";

const usersQueryKey = (repositoryId: string | undefined) =>
  ["desktop", "ticketRpc", "users", repositoryId] as const;

const userListQueryKey = (repositoryId: string | undefined, query: UserProfileQuery = {}) =>
  [...usersQueryKey(repositoryId), "list", query] as const;

const labelsQueryKey = (repositoryId: string | undefined) =>
  ["desktop", "ticketRpc", "labels", repositoryId] as const;

const labelListQueryKey = (repositoryId: string | undefined, query: LabelDefinitionQuery = {}) =>
  [...labelsQueryKey(repositoryId), "list", query] as const;

export const viewsQueryKey = (repositoryId: string | undefined) =>
  ["desktop", "ticketRpc", "views", repositoryId] as const;

const viewListQueryKey = (repositoryId: string | undefined, query: SavedViewQuery = {}) =>
  [...viewsQueryKey(repositoryId), "list", query] as const;

const viewDetailQueryKey = (repositoryId: string | undefined, viewId: string | undefined) =>
  [...viewsQueryKey(repositoryId), "detail", viewId] as const;

const templatesQueryKey = (repositoryId: string | undefined) =>
  ["desktop", "ticketRpc", "templates", repositoryId] as const;

const templateListQueryKey = (repositoryId: string | undefined, query: IssueTemplateQuery = {}) =>
  [...templatesQueryKey(repositoryId), "list", query] as const;

const initiativeProgressQueryKey = (
  repositoryId: string | undefined,
  initiativeId: string | undefined,
) => ["desktop", "ticketRpc", "initiativeProgress", repositoryId, initiativeId] as const;

const listUsersForRepository = async (
  repositoryId: string,
  query: UserProfileQuery = {},
): Promise<UserProfilePage> =>
  ticketRpcClient.call("ticket.user.list", {
    input: query,
    repository: {
      id: repositoryId,
    },
  });

const listLabelsForRepository = async (
  repositoryId: string,
  query: LabelDefinitionQuery = {},
): Promise<LabelDefinitionPage> =>
  ticketRpcClient.call("ticket.label.list", {
    input: query,
    repository: {
      id: repositoryId,
    },
  });

const listViewsForRepository = async (
  repositoryId: string,
  query: SavedViewQuery = {},
): Promise<SavedViewPage> =>
  ticketRpcClient.call("ticket.view.list", {
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
  ticketRpcClient.call("ticket.view.get", {
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
): Promise<IssueTemplatePage> =>
  ticketRpcClient.call("ticket.template.list", {
    input: query,
    repository: {
      id: repositoryId,
    },
  });

const getInitiativeProgressForRepository = async ({
  initiativeId,
  repositoryId,
}: {
  readonly initiativeId: string;
  readonly repositoryId: string;
}): Promise<InitiativeProgress> =>
  ticketRpcClient.call("ticket.initiative.progress", {
    input: {
      id: initiativeId,
    },
    repository: {
      id: repositoryId,
    },
  });

export const useUserListQuery = (repositoryId: string | undefined, query: UserProfileQuery = {}) =>
  useQuery({
    enabled: repositoryId !== undefined && getDesktopBridge() !== undefined,
    queryFn: () => {
      if (!repositoryId) {
        throw new Error("Choose a repository before loading users.");
      }

      return listUsersForRepository(repositoryId, query);
    },
    queryKey: userListQueryKey(repositoryId, query),
  });

export const useLabelListQuery = (
  repositoryId: string | undefined,
  query: LabelDefinitionQuery = {},
) =>
  useQuery({
    enabled: repositoryId !== undefined && getDesktopBridge() !== undefined,
    queryFn: () => {
      if (!repositoryId) {
        throw new Error("Choose a repository before loading labels.");
      }

      return listLabelsForRepository(repositoryId, query);
    },
    queryKey: labelListQueryKey(repositoryId, query),
  });

export const useSavedViewListQuery = (
  repositoryId: string | undefined,
  query: SavedViewQuery = {},
) =>
  useQuery({
    enabled: repositoryId !== undefined && getDesktopBridge() !== undefined,
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
    enabled: repositoryId !== undefined && viewId !== undefined && getDesktopBridge() !== undefined,
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
    enabled: repositoryId !== undefined && getDesktopBridge() !== undefined,
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
    enabled:
      repositoryId !== undefined && initiativeId !== undefined && getDesktopBridge() !== undefined,
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
