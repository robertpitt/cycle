import { useQuery } from "@tanstack/react-query";
import { defaultAppConfig } from "../../shared/AppConfig.ts";
import { getDesktopBridge } from "../lib/desktopBridge.ts";

export const appConfigQueryKey = ["desktop", "appConfig"] as const;

const getRendererAppConfig = async () => getDesktopBridge()?.getAppConfig() ?? defaultAppConfig();

export const useAppConfigQuery = () =>
  useQuery({
    queryFn: getRendererAppConfig,
    queryKey: appConfigQueryKey,
  });
