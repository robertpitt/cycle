import { isRouteErrorResponse, useRouteError } from "react-router";

export const RouteErrorScreen = () => {
  const error = useRouteError();

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "An unexpected renderer error occurred.";

  return (
    <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
      <section className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-elevated">
        <h1 className="text-base font-semibold tracking-normal">Renderer error</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </section>
    </main>
  );
};
