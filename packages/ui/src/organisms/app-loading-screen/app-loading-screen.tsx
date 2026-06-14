import { CheckCircle2, LoaderCircle, TriangleAlert } from "lucide-react";
import { BrandMark } from "../../atoms/brand-mark/index.ts";
import { Text } from "../../atoms/text/index.ts";
import { AppShellRoot } from "../app-shell/index.ts";

export type AppLoadingRepository = {
  readonly displayName: string;
  readonly repositoryId: string;
  readonly stage: "failed" | "ready" | "syncing" | string;
};

export type AppLoadingStatus = {
  readonly message?: string;
  readonly repositories?: readonly AppLoadingRepository[];
};

export type AppLoadingScreenProps = {
  readonly repositoryLimit?: number;
  readonly status?: AppLoadingStatus;
};

export const AppLoadingScreen = ({ repositoryLimit = 4, status }: AppLoadingScreenProps) => {
  const repositories = status?.repositories ?? [];

  return (
    <AppShellRoot className="grid place-items-center">
      <div className="grid w-full max-w-md justify-items-center gap-4 px-6">
        <BrandMark showLabel={false} />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
          {status?.message ?? "Loading"}
        </div>
        {repositories.length > 0 ? (
          <div className="grid w-full gap-1.5 rounded-md border border-border bg-surface p-2">
            {repositories.slice(0, repositoryLimit).map((repository) => (
              <div
                className="flex min-w-0 items-center justify-between gap-3 text-muted-foreground"
                key={repository.repositoryId}
              >
                <Text truncate variant="meta">
                  {repository.displayName}
                </Text>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs">
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
            {repositories.length > repositoryLimit ? (
              <Text tone="muted" variant="meta">
                {repositories.length - repositoryLimit} more repositories
              </Text>
            ) : null}
          </div>
        ) : null}
      </div>
    </AppShellRoot>
  );
};
