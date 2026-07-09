import { RefreshCw, Settings, Upload } from "lucide-react";
import * as React from "react";
import { Button, StatusIndicator } from "@cycle/ui/atoms";
import type { RepositoryRecord } from "@cycle/config";
import type { BootstrapRepositoryStatus, BootstrapStatus } from "@cycle/contracts/schemas/backend";
import { usePushRepositoryMutation, useSyncRepositoryMutation } from "../mutations/index.ts";

type RepositorySettingsIndexPanelProps = {
  readonly bootstrapStatus?: BootstrapStatus;
  readonly onRepositorySelect: (repositoryId: string) => void;
  readonly repositories: readonly RepositoryRecord[];
};

const bootstrapByRepository = (
  bootstrapStatus: BootstrapStatus | undefined,
): ReadonlyMap<string, BootstrapRepositoryStatus> =>
  new Map(
    (bootstrapStatus?.repositories ?? []).map((repository) => [
      repository.repositoryId,
      repository,
    ]),
  );

const stageTone = (
  stage: string | undefined,
): React.ComponentProps<typeof StatusIndicator>["tone"] => {
  if (stage === "ready") return "success";
  if (stage === "syncing" || stage === "opening") return "info";
  if (stage === "failed") return "warning";
  return "neutral";
};

const errorText = (error: unknown): string | undefined =>
  error instanceof Error
    ? error.message
    : error === undefined || error === null
      ? undefined
      : String(error);

export const RepositorySettingsIndexPanel = ({
  bootstrapStatus,
  onRepositorySelect,
  repositories,
}: RepositorySettingsIndexPanelProps) => {
  const statuses = React.useMemo(() => bootstrapByRepository(bootstrapStatus), [bootstrapStatus]);
  const syncRepository = useSyncRepositoryMutation();
  const pushRepository = usePushRepositoryMutation();
  const [pendingRepositoryId, setPendingRepositoryId] = React.useState<string | null>(null);
  const pending = syncRepository.isPending || pushRepository.isPending;

  const runSync = (repositoryId: string) => {
    setPendingRepositoryId(repositoryId);
    syncRepository.mutate(repositoryId, {
      onSettled: () => setPendingRepositoryId(null),
    });
  };

  const runPush = (repositoryId: string) => {
    setPendingRepositoryId(repositoryId);
    pushRepository.mutate(repositoryId, {
      onSettled: () => setPendingRepositoryId(null),
    });
  };

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 p-5">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-normal text-foreground">Repositories</h1>
        <p className="text-sm text-muted-foreground">
          Registered local repositories, bootstrap state, and remote actions.
        </p>
      </header>

      <section className="rounded-lg border border-border bg-surface p-5 shadow-card">
        <div className="mb-4">
          <h2 className="text-base font-semibold tracking-normal text-foreground">
            Registered repositories
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Removing a repository only unregisters it from Cycle. Source files stay on disk.
          </p>
        </div>
        <div className="grid gap-3">
          {repositories.length === 0 ? (
            <p className="text-sm text-muted-foreground">No repositories are registered.</p>
          ) : (
            repositories.map((repository) => {
              const status = statuses.get(repository.id);
              const hasRemote = status?.defaultRemote !== undefined;
              const rowPending = pending && pendingRepositoryId === repository.id;

              return (
                <div
                  className="grid gap-3 rounded-md border border-border bg-background/70 p-4"
                  key={repository.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-foreground">
                        {repository.displayName}
                      </h3>
                      <p className="break-all text-xs text-muted-foreground">{repository.path}</p>
                    </div>
                    <StatusIndicator
                      label={status?.stage ?? "Unavailable"}
                      tone={stageTone(status?.stage)}
                    />
                  </div>

                  <dl className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                    <div>
                      <dt>Branch</dt>
                      <dd className="font-medium text-foreground">
                        {status?.currentBranch ?? "Unavailable"}
                      </dd>
                    </div>
                    <div>
                      <dt>Remote</dt>
                      <dd className="font-medium text-foreground">
                        {status?.defaultRemote ?? "No default remote"}
                      </dd>
                    </div>
                    <div>
                      <dt>Warnings</dt>
                      <dd className="font-medium text-foreground">{status?.warningCount ?? 0}</dd>
                    </div>
                  </dl>

                  {status?.error ? (
                    <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {status.error}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      leftIcon={<Settings aria-hidden className="size-4" />}
                      onClick={() => onRepositorySelect(repository.id)}
                      size="sm"
                      variant="outline"
                    >
                      Settings
                    </Button>
                    <Button
                      disabled={rowPending || !hasRemote}
                      leftIcon={<RefreshCw aria-hidden className="size-4" />}
                      loading={rowPending && syncRepository.isPending}
                      loadingLabel="Syncing"
                      onClick={() => runSync(repository.id)}
                      size="sm"
                      variant="outline"
                    >
                      Sync
                    </Button>
                    <Button
                      disabled={rowPending || !hasRemote}
                      leftIcon={<Upload aria-hidden className="size-4" />}
                      loading={rowPending && pushRepository.isPending}
                      loadingLabel="Pushing"
                      onClick={() => runPush(repository.id)}
                      size="sm"
                      variant="outline"
                    >
                      Push
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
        {errorText(syncRepository.error ?? pushRepository.error) ? (
          <p className="mt-3 text-sm text-destructive">
            {errorText(syncRepository.error ?? pushRepository.error)}
          </p>
        ) : null}
      </section>
    </div>
  );
};
