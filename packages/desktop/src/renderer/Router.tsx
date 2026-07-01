import { createHashRouter, Navigate, type RouteObject } from "react-router";
import { NotFoundScreen, RouteErrorScreen, WorkspaceScreen } from "./screens/index.ts";
import { readStoredWorkspacePath } from "./screens/workspace/workspaceRoute.ts";

const WorkspaceRouteRedirect = () => {
  const fallbackPath =
    typeof window === "undefined" ? undefined : readStoredWorkspacePath(window.localStorage);

  return <Navigate replace to={fallbackPath ?? "/inbox"} />;
};

const workspaceRoutePaths = [
  "chat",
  "inbox",
  "issues",
  "initiatives",
  "views",
  "settings",
  "settings/:settingsSection",
  "settings/repositories/:repositoryId",
  "repositories/:repositoryId/issues",
  "repositories/:repositoryId/issues/:issueId",
  "repositories/:repositoryId/views",
  "repositories/:repositoryId/views/:viewId",
  "repositories/:repositoryId/views/:viewId/issues/:issueId",
  "repositories/:repositoryId/history",
  "repositories/:repositoryId/settings",
] as const;

const rendererRoutes = [
  {
    children: [
      {
        element: <WorkspaceRouteRedirect />,
        index: true,
      },
      ...workspaceRoutePaths.map((path) => ({
        element: <WorkspaceScreen />,
        path,
      })),
      {
        element: <NotFoundScreen />,
        path: "*",
      },
    ],
    errorElement: <RouteErrorScreen />,
    path: "/",
  },
] satisfies RouteObject[];

export const rendererRouter = createHashRouter(rendererRoutes);
