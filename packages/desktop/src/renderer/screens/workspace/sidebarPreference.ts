export const sidebarCollapsedStorageKey = "cycle.desktop.sidebarCollapsed.v1";

export type SidebarPreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export const readSidebarCollapsed = (storage: SidebarPreferenceStorage | undefined): boolean => {
  if (!storage) return false;

  try {
    return storage.getItem(sidebarCollapsedStorageKey) === "true";
  } catch {
    return false;
  }
};

export const writeSidebarCollapsed = (
  storage: SidebarPreferenceStorage | undefined,
  collapsed: boolean,
): void => {
  if (!storage) return;

  try {
    storage.setItem(sidebarCollapsedStorageKey, String(collapsed));
  } catch {
    // Losing this preference should not block sidebar interaction.
  }
};

export const toggleSidebarCollapsed = (
  storage: SidebarPreferenceStorage | undefined,
  collapsed: boolean,
): boolean => {
  const nextCollapsed = !collapsed;
  writeSidebarCollapsed(storage, nextCollapsed);
  return nextCollapsed;
};
