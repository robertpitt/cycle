import { useMutation, useQueryClient } from "@tanstack/react-query";
import { defaultAppConfig, type AppConfigState } from "../../shared/AppConfig.ts";
import type { SelectRepositoryFolderResult } from "../../shared/LocalWorkspace.ts";
import { getDesktopBridge } from "../lib/desktopBridge.ts";
import { makeFallbackRepository } from "../lib/repositories.ts";
import { appConfigQueryKey } from "../queries/appConfig.ts";

type RepositoryInitialiseRequest = Extract<
  SelectRepositoryFolderResult,
  { readonly status: "not-git" }
>;

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
    mutationFn: async (): Promise<SelectRepositoryFolderResult> => {
      const bridge = getDesktopBridge();

      if (bridge) return bridge.selectRepositoryFolder();
      return {
        repository: makeFallbackRepository("/Users/robertpitt/Projects/cycle"),
        status: "added",
      };
    },
    onMutate: () => {
      onImportError(undefined);
      onInitialiseError(undefined);
    },
    onSuccess: async (result) => {
      if (result.status === "cancelled") return;

      if (result.status === "not-git") {
        onInitialiseRequest(result);
        return;
      }

      const bridge = getDesktopBridge();
      if (bridge) {
        queryClient.setQueryData(appConfigQueryKey, await bridge.getAppConfig());
        return;
      }

      const current = appConfig ?? defaultAppConfig();
      queryClient.setQueryData(appConfigQueryKey, {
        ...current,
        localWorkspace: {
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
