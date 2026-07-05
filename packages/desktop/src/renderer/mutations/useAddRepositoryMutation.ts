import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  defaultAppConfig,
  type AppConfigState,
  type RepositoryRecord,
} from "../../shared/AppConfig.ts";
import { cycleApiClient } from "../lib/cycleApiClient.ts";
import { getDesktopBridge } from "../lib/desktopBridge.ts";
import { makeFallbackRepository } from "../lib/repositories.ts";
import { appConfigQueryKey } from "../queries/appConfig.ts";

type RepositoryInitialiseRequest = {
  readonly message?: string;
  readonly path: string;
};

type AddRepositoryResult =
  | {
      readonly status: "cancelled";
    }
  | {
      readonly appConfig?: AppConfigState;
      readonly repository: RepositoryRecord;
      readonly status: "added";
    }
  | {
      readonly message: string;
      readonly path: string;
      readonly status: "not-git";
    };

type UseAddRepositoryMutationOptions = {
  readonly appConfig?: AppConfigState;
  readonly onImportError: (error?: React.ReactNode) => void;
  readonly onInitialiseError: (error?: React.ReactNode) => void;
  readonly onInitialiseRequest: (request: RepositoryInitialiseRequest | null) => void;
};

export const useAddRepositoryMutation = ({
  appConfig,
  onImportError,
  onInitialiseError,
  onInitialiseRequest,
}: UseAddRepositoryMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<AddRepositoryResult> => {
      const bridge = getDesktopBridge();

      if (bridge) {
        const selection = await bridge.selectRepositoryFolder();
        if (selection.status === "cancelled") return { status: "cancelled" };

        const opened = await cycleApiClient.openRepositoryPath({ path: selection.path });
        const nextConfig = await cycleApiClient.getAppConfig();
        const repository =
          nextConfig.localWorkspace.repositories.find(
            (candidate) => candidate.id === opened.repositoryId,
          ) ??
          nextConfig.localWorkspace.repositories.find(
            (candidate) => candidate.path === selection.path,
          );

        if (repository === undefined) {
          throw new Error("Repository was opened but was not found in app config.");
        }

        return {
          appConfig: nextConfig,
          repository,
          status: "added",
        };
      }

      return {
        repository: makeFallbackRepository("/Users/robertpitt/Projects/cycle"),
        status: "added",
      };
    },
    onMutate: () => {
      onImportError(undefined);
      onInitialiseError(undefined);
    },
    onSuccess: (result) => {
      if (result.status === "cancelled") return;

      if (result.status === "not-git") {
        onInitialiseRequest(result);
        return;
      }

      if (result.appConfig !== undefined) {
        queryClient.setQueryData(appConfigQueryKey, result.appConfig);
        return;
      }

      const current = appConfig ?? defaultAppConfig();
      queryClient.setQueryData(appConfigQueryKey, {
        ...current,
        localWorkspace: {
          ...current.localWorkspace,
          repositories: [
            ...current.localWorkspace.repositories.filter(
              (repository) => repository.id !== result.repository.id,
            ),
            result.repository,
          ],
        },
      } satisfies AppConfigState);
    },
    onError: (error) => {
      onImportError(error instanceof Error ? error.message : "Unable to add repository.");
    },
  });
};
