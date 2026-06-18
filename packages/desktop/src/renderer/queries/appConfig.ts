import { useQuery } from "@tanstack/react-query";
import type { AppConfigState } from "../../shared/AppConfig.ts";
import { cycleApiClient } from "../lib/cycleApiClient.ts";
import { getDesktopBridge } from "../lib/desktopBridge.ts";

export const appConfigQueryKey = ["desktop", "appConfig"] as const;

export const getRendererAppConfig = async (): Promise<AppConfigState> => {
  const bridge = getDesktopBridge();

  try {
    return await cycleApiClient.getAppConfig();
  } catch (error) {
    if (bridge) return bridge.getAppConfig();
    throw error;
  }
};

export const useAppConfigQuery = () =>
  useQuery({
    queryFn: getRendererAppConfig,
    queryKey: appConfigQueryKey,
  });
