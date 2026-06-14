import { AppMessageScreen } from "@cycle/ui/organisms";
import { isRouteErrorResponse, useRouteError } from "react-router";

export const RouteErrorScreen = () => {
  const error = useRouteError();

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "An unexpected renderer error occurred.";

  return <AppMessageScreen description={message} title="Renderer error" />;
};
