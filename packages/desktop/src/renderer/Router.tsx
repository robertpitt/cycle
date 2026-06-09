import { createHashRouter, type RouteObject } from "react-router";
import { NotFoundScreen, RouteErrorScreen, WorkspaceScreen } from "./screens/index.ts";

export const rendererRoutes = [
  {
    children: [
      {
        element: <WorkspaceScreen />,
        index: true,
      },
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
