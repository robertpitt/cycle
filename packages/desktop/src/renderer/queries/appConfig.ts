import { useQuery } from "@tanstack/react-query";
import type { AppConfigState } from "@cycle/backend/client";
import { cycleApiClient } from "../lib/cycleApiClient.ts";

export const appConfigQueryKey = ["desktop", "appConfig"] as const;

export const getRendererAppConfig = async (): Promise<AppConfigState> => {
  return cycleApiClient.getAppConfig();
};

export const useAppConfigQuery = () =>
  useQuery({
    queryFn: getRendererAppConfig,
    queryKey: appConfigQueryKey,
  });
