import { useQuery } from "@tanstack/react-query";
import type { BootstrapStatus } from "../../shared/Bootstrap.ts";
import { getDesktopBridge } from "../lib/desktopBridge.ts";

export const bootstrapStatusQueryKey = ["desktop", "bootstrapStatus"] as const;

export const readyBootstrapStatus = (): BootstrapStatus => ({
  blocking: false,
  message: "Ready",
  phase: "ready",
  repositories: [],
});

export const getBootstrapStatus = async (): Promise<BootstrapStatus> =>
  getDesktopBridge()?.getBootstrapStatus() ?? readyBootstrapStatus();

export const useBootstrapStatusQuery = () =>
  useQuery({
    queryFn: getBootstrapStatus,
    queryKey: bootstrapStatusQueryKey,
    refetchInterval: (query) => (query.state.data?.blocking === false ? false : 250),
  });
