import { Link } from "react-router";

export const NotFoundScreen = () => (
  <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
    <section className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-elevated">
      <h1 className="text-base font-semibold tracking-normal">Screen not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The requested screen is not available in this renderer.
      </p>
      <Link
        className="mt-4 inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-subtle"
        to="/"
      >
        Return home
      </Link>
    </section>
  </main>
);
