export const lastWorkspaceRouteStorageKey = "cycle.desktop.lastWorkspaceRoute.v1";

type WorkspaceTopLevelPage = "chat" | "inbox" | "initiatives" | "issues" | "views";

export type WorkspaceLocation =
  | {
      readonly page: WorkspaceTopLevelPage;
      readonly scope: "workspace";
    }
  | {
      readonly page: "settings";
      readonly scope: "workspace";
      readonly settingsSection?: string;
      readonly settingsRepositoryId?: string;
    }
  | {
      readonly issueId?: string;
      readonly page: "issues";
      readonly repositoryId: string;
      readonly scope: "repository";
    }
  | {
      readonly page: "pages";
      readonly pageId?: string;
      readonly repositoryId: string;
      readonly scope: "repository";
    }
  | {
      readonly issueId?: string;
      readonly page: "views";
      readonly repositoryId: string;
      readonly scope: "repository";
      readonly viewId?: string;
    }
  | {
      readonly page: "history" | "settings";
      readonly repositoryId: string;
      readonly scope: "repository";
    };

export type WorkspaceRouteStorage = Pick<Storage, "getItem" | "setItem">;

const topLevelPages = new Set<WorkspaceTopLevelPage>([
  "chat",
  "inbox",
  "initiatives",
  "issues",
  "views",
]);

const settingsSections = new Set([
  "advanced",
  "agents",
  "endpoints",
  "general",
  "profile",
  "repositories",
]);

const encodeSegment = (value: string): string => encodeURIComponent(value);

const decodeSegment = (value: string): string | undefined => {
  try {
    const decoded = decodeURIComponent(value);
    return decoded.length > 0 ? decoded : undefined;
  } catch {
    return undefined;
  }
};

const splitWorkspacePath = (path: string): readonly string[] => {
  const withoutHash = path.startsWith("#") ? path.slice(1) : path;
  const withoutQuery = withoutHash.split(/[?#]/u, 1)[0] ?? "";
  const trimmed = withoutQuery.replace(/^\/+|\/+$/gu, "");

  if (trimmed.length === 0) return [];

  return trimmed.split("/").map((segment) => decodeSegment(segment) ?? "");
};

export const toWorkspacePath = (location: WorkspaceLocation): string => {
  if (location.scope === "workspace") {
    if (location.page === "settings") {
      if (location.settingsSection === "repositories" && location.settingsRepositoryId) {
        return `/settings/repositories/${encodeSegment(location.settingsRepositoryId)}`;
      }

      return location.settingsSection
        ? `/settings/${encodeSegment(location.settingsSection)}`
        : "/settings";
    }

    return `/${location.page}`;
  }

  const repositoryPath = `/repositories/${encodeSegment(location.repositoryId)}`;

  if (location.page === "issues") {
    return location.issueId
      ? `${repositoryPath}/issues/${encodeSegment(location.issueId)}`
      : `${repositoryPath}/issues`;
  }

  if (location.page === "pages") {
    return location.pageId
      ? `${repositoryPath}/pages/${encodeSegment(location.pageId)}`
      : `${repositoryPath}/pages`;
  }

  if (location.page === "views") {
    if (location.viewId && location.issueId) {
      return `${repositoryPath}/views/${encodeSegment(location.viewId)}/issues/${encodeSegment(
        location.issueId,
      )}`;
    }

    return location.viewId
      ? `${repositoryPath}/views/${encodeSegment(location.viewId)}`
      : `${repositoryPath}/views`;
  }

  return `${repositoryPath}/${location.page}`;
};

export const parseWorkspacePath = (path: string): WorkspaceLocation | undefined => {
  const segments = splitWorkspacePath(path);

  if (segments.some((segment) => segment.length === 0)) return undefined;

  if (segments[0] === "settings" && (segments.length === 1 || segments.length === 2)) {
    if (segments[1] !== undefined && !settingsSections.has(segments[1])) return undefined;

    return {
      page: "settings",
      scope: "workspace",
      ...(segments[1] ? { settingsSection: segments[1] } : {}),
    };
  }

  if (segments[0] === "settings" && segments[1] === "repositories" && segments.length === 3) {
    return {
      page: "settings",
      scope: "workspace",
      settingsRepositoryId: segments[2],
      settingsSection: "repositories",
    };
  }

  if (segments.length === 1 && topLevelPages.has(segments[0] as WorkspaceTopLevelPage)) {
    return {
      page: segments[0] as WorkspaceTopLevelPage,
      scope: "workspace",
    };
  }

  if (segments[0] !== "repositories" || segments.length < 3) return undefined;

  const repositoryId = segments[1];
  const page = segments[2];

  if (!repositoryId) return undefined;

  if (page === "issues" && (segments.length === 3 || segments.length === 4)) {
    return {
      issueId: segments[3],
      page,
      repositoryId,
      scope: "repository",
    };
  }

  if (page === "pages" && (segments.length === 3 || segments.length === 4)) {
    return {
      page,
      pageId: segments[3],
      repositoryId,
      scope: "repository",
    };
  }

  if (page === "views") {
    if (segments.length === 3) {
      return {
        page,
        repositoryId,
        scope: "repository",
      };
    }

    if (segments.length === 4) {
      return {
        page,
        repositoryId,
        scope: "repository",
        viewId: segments[3],
      };
    }

    if (segments.length === 6 && segments[4] === "issues") {
      return {
        issueId: segments[5],
        page,
        repositoryId,
        scope: "repository",
        viewId: segments[3],
      };
    }
  }

  if (page === "settings" && segments.length === 3) {
    return {
      page: "settings",
      scope: "workspace",
      settingsRepositoryId: repositoryId,
      settingsSection: "repositories",
    };
  }

  if (page === "history" && segments.length === 3) {
    return {
      page,
      repositoryId,
      scope: "repository",
    };
  }

  return undefined;
};

const isWorkspacePath = (path: string): boolean => parseWorkspacePath(path) !== undefined;

export const parentWorkspacePath = (location: WorkspaceLocation): string | undefined => {
  if (location.scope === "workspace") {
    if (location.page === "settings" && location.settingsRepositoryId) {
      return "/settings/repositories";
    }

    return location.page === "inbox" ? undefined : "/inbox";
  }

  if (location.page === "issues" && location.issueId) {
    return toWorkspacePath({
      page: "issues",
      repositoryId: location.repositoryId,
      scope: "repository",
    });
  }

  if (location.page === "pages" && location.pageId) {
    return toWorkspacePath({
      page: "pages",
      repositoryId: location.repositoryId,
      scope: "repository",
    });
  }

  if (location.page === "views" && location.issueId && location.viewId) {
    return toWorkspacePath({
      page: "views",
      repositoryId: location.repositoryId,
      scope: "repository",
      viewId: location.viewId,
    });
  }

  if (location.page === "views" && location.viewId) {
    return toWorkspacePath({
      page: "views",
      repositoryId: location.repositoryId,
      scope: "repository",
    });
  }

  return "/issues";
};

export const invalidRepositoryFallbackPath = (hasRepositories: boolean): string =>
  hasRepositories ? "/issues" : "/inbox";

export const readStoredWorkspacePath = (
  storage: WorkspaceRouteStorage | undefined,
): string | undefined => {
  if (!storage) return undefined;

  try {
    const value = storage.getItem(lastWorkspaceRouteStorageKey);
    return value && isWorkspacePath(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

export const writeStoredWorkspacePath = (
  storage: WorkspaceRouteStorage | undefined,
  path: string,
): void => {
  if (!storage || !isWorkspacePath(path)) return;

  try {
    storage.setItem(lastWorkspaceRouteStorageKey, path);
  } catch {
    // Losing the last route should not block navigation.
  }
};
