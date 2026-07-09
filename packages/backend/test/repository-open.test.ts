import { strict as assert } from "node:assert";
import {
  DatabaseService,
  type DatabaseServiceShape,
  type RepositoryInput,
  type RepositoryStatus,
} from "@cycle/database";
import { GitRepository } from "@cycle/git";
import { GitStores, type GitStoresShape } from "@cycle/git-store";
import { RepositoryOpen } from "@cycle/usecases";
import { Effect, Layer } from "effect";
import { describe, it } from "vitest";
import { BackendRepositoryOpenServiceLive } from "../src/BackendRepositoryOpen.ts";
import { LocalWorkspace } from "../src/LocalWorkspace.ts";

const repository = {
  addedAt: "2026-06-12T00:00:00.000Z",
  displayName: "Cycle Test",
  id: "repo-test",
  path: "/tmp/cycle-test",
  preferences: {
    autoSync: true,
    commitStyle: "descriptive" as const,
    sidebarExpanded: true,
  },
};

const repositoryStatus = (repositoryId: string, input: RepositoryInput): RepositoryStatus => ({
  activeGeneration: input.syncOnOpen === false ? 0 : 1,
  activeSnapshotId: input.syncOnOpen === false ? null : "snapshot-test",
  repositoryId,
  status: input.syncOnOpen === false ? "empty" : "ready",
  warningCount: 0,
});

const makeLayer = (opened: Array<RepositoryInput>) => {
  const database = Layer.succeed(
    DatabaseService,
    DatabaseService.of({
      openRepository: (input) =>
        Effect.sync(() => {
          opened.push(input);
          return repositoryStatus(input.repositoryId, input);
        }),
    } as Partial<DatabaseServiceShape> as DatabaseServiceShape),
  );

  const gitRepository = Layer.succeed(
    GitRepository,
    GitRepository.of({
      ensure: (repositoryPath) =>
        Effect.succeed({
          cwd: repositoryPath,
          gitDir: `${repositoryPath}/.git`,
        }),
      init: (repositoryPath) =>
        Effect.succeed({
          cwd: repositoryPath,
          gitDir: `${repositoryPath}/.git`,
        }),
      inspect: (repositoryPath) =>
        Effect.succeed({
          gitDir: `${repositoryPath}/.git`,
          path: repositoryPath,
          status: "git",
        }),
      metadata: (repositoryPath) =>
        Effect.succeed({
          currentBranch: "main",
          gitDir: `${repositoryPath}/.git`,
          inspectedAt: "2026-06-12T00:00:00.000Z",
          path: repositoryPath,
          remotes: [],
        }),
      resolveGitDir: (repositoryPath) => Effect.succeed(`${repositoryPath}/.git`),
    }),
  );

  const gitStores = Layer.succeed(
    GitStores,
    GitStores.of({
      invalidate: () => Effect.void,
      scoped: () => Effect.die("Git store should not be opened by this test."),
      withStore: () => Effect.die("Git store should not be opened by this test."),
    } as GitStoresShape),
  );

  const workspace = Layer.succeed(
    LocalWorkspace,
    LocalWorkspace.of({
      initializeRepositoryPath: () => Effect.succeed(repository),
      listRepositories: Effect.succeed([repository]),
      markRepositoryOpened: () => Effect.succeed(repository),
      removeRepository: () => Effect.succeed([]),
      updateRepositoryPreferences: () => Effect.succeed(repository),
      upsertRepositoryPath: () => Effect.succeed(repository),
    }),
  );

  return BackendRepositoryOpenServiceLive.pipe(
    Layer.provide(Layer.mergeAll(database, gitRepository, gitStores, workspace)),
  );
};

const openRepository = (input: {
  readonly path?: string;
  readonly repositoryId?: string;
  readonly syncOnOpen?: boolean;
}) => RepositoryOpen.run(input, { requestId: "req-test", source: "test" });

describe("BackendRepositoryOpenService", () => {
  it("materializes repositories by default when opened directly", async () => {
    const opened: Array<RepositoryInput> = [];

    const status = await Effect.runPromise(
      openRepository({ path: repository.path }).pipe(Effect.provide(makeLayer(opened))),
    );

    assert.equal(status.status, "ready");
    assert.equal(opened[0]?.syncOnOpen, true);
  });

  it("preserves explicit syncOnOpen false for callers that only want registration", async () => {
    const opened: Array<RepositoryInput> = [];

    const status = await Effect.runPromise(
      openRepository({ path: repository.path, syncOnOpen: false }).pipe(
        Effect.provide(makeLayer(opened)),
      ),
    );

    assert.equal(status.status, "empty");
    assert.equal(opened[0]?.syncOnOpen, false);
  });
});
