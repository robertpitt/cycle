import { BrandMark } from "@cycle/ui/atoms";
import { AppShellRoot } from "@cycle/ui/organisms";
import { CheckCircle2, LoaderCircle, TriangleAlert } from "lucide-react";
import type { BootstrapStatus } from "../../shared/Bootstrap.ts";

type BootloaderScreenProps = {
  readonly status?: BootstrapStatus;
};

const repositoryLimit = 4;

export const BootloaderScreen = ({ status }: BootloaderScreenProps) => (
  <AppShellRoot className="grid place-items-center">
    <div className="grid w-full max-w-md justify-items-center gap-4 px-6">
      <BrandMark showLabel={false} />
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden className="size-4 animate-spin" />
        {status?.message ?? "Loading"}
      </div>
      {status?.repositories.length ? (
        <div className="grid w-full gap-1.5 rounded-md border border-border bg-surface p-2 text-xs">
          {status.repositories.slice(0, repositoryLimit).map((repository) => (
            <div
              className="flex min-w-0 items-center justify-between gap-3 text-muted-foreground"
              key={repository.repositoryId}
            >
              <span className="min-w-0 truncate">{repository.displayName}</span>
              <span className="inline-flex shrink-0 items-center gap-1">
                {repository.stage === "failed" ? (
                  <TriangleAlert aria-hidden className="size-3.5 text-warning" />
                ) : repository.stage === "ready" ? (
                  <CheckCircle2 aria-hidden className="size-3.5 text-success" />
                ) : (
                  <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
                )}
                {repository.stage}
              </span>
            </div>
          ))}
          {status.repositories.length > repositoryLimit ? (
            <div className="text-muted-foreground">
              {status.repositories.length - repositoryLimit} more repositories
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  </AppShellRoot>
);
