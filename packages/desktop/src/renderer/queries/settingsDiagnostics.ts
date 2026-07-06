import { useQuery } from "@tanstack/react-query";
import type { SettingsDiagnostics } from "../../ipc/Channels.ts";
import { getDesktopBridge } from "../lib/desktopBridge.ts";

export const settingsDiagnosticsQueryKey = ["desktop", "settingsDiagnostics"] as const;

const unavailableDiagnostics = (): SettingsDiagnostics => ({
  api: {
    auth: "unknown",
    enabled: false,
    status: "unknown",
  },
  app: {
    nodeVersion: "unknown",
    schemaVersion: 0,
  },
  mcp: {
    enabled: false,
    status: "unknown",
  },
  paths: {
    agentWorktrees: "Unavailable outside Electron",
    appConfig: "Unavailable outside Electron",
    cycleHome: "Unavailable outside Electron",
    database: "Unavailable outside Electron",
    log: "Unavailable outside Electron",
    runtimeDiscovery: "Unavailable outside Electron",
  },
  runtimeFile: {
    path: "Unavailable outside Electron",
    status: "missing",
  },
});

const getSettingsDiagnostics = async (): Promise<SettingsDiagnostics> =>
  getDesktopBridge()?.getSettingsDiagnostics() ?? unavailableDiagnostics();

export const useSettingsDiagnosticsQuery = (enabled = true) =>
  useQuery({
    enabled,
    queryFn: getSettingsDiagnostics,
    queryKey: settingsDiagnosticsQueryKey,
    retry: false,
  });
