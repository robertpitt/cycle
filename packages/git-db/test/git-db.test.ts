import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Data, Effect } from "effect";
import {
  Event as EventApi,
  GitDbFilesystem,
  GitDbInMemory,
  GitDbLive,
  InvalidJsonDocumentError,
  InvalidNamespaceError,
  InvalidPathError,
  Pointer as PointerApi,
  PointerConflictError,
  PointerNotFoundError,
  Snapshot as SnapshotApi,
  SnapshotNotFoundError,
  Store as StoreApi,
  Sync as SyncApi,
  Transaction as TransactionApi,
  TransactionInactiveError,
} from "../src/index.ts";
import { assert, describe, it } from "./effect-vitest.ts";

const execFileAsync = promisify(execFile);

class TestFailure extends Data.TaggedError("TestFailure")<{
  readonly cause?: unknown;
  readonly message: string;
}> {}

const attemptPromise = <A>(try_: () => Promise<A>): Effect.Effect<A, TestFailure> =>
  Effect.tryPromise({
    catch: (cause) => new TestFailure({ cause, message: "test promise failed" }),
    try: try_,
  });

const cleanupDir = (dir: string): Effect.Effect<void, never> =>
  attemptPromise(() => rm(dir, { force: true, recursive: true })).pipe(Effect.orDie);

const withTempDir = <A, E, R>(
  prefix: string,
  f: (dir: string) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | TestFailure, R> =>
  Effect.scoped(
    Effect.gen(function* () {
      const dir = yield* Effect.acquireRelease(
        attemptPromise(() => mkdtemp(path.join(os.tmpdir(), prefix))),
        cleanupDir,
      );

      return yield* f(dir);
    }),
  );

const git = (cwd: string, args: ReadonlyArray<string>): Effect.Effect<void, TestFailure> =>
  attemptPromise(() => execFileAsync("git", [...args], { cwd })).pipe(Effect.asVoid);

const storeFor = (repositoryPath: string) =>
  StoreApi.StoreService.pipe(
    Effect.provide(
      GitDbLive({
        cwd: repositoryPath,
        database: "cycle",
        gitDir: path.join(repositoryPath, ".git"),
      }),
    ),
  );

const commitDocument = (
  store: StoreApi.StoreServiceShape,
  filePath: string,
  value: Readonly<Record<string, unknown>>,
  message: string,
) =>
  Effect.gen(function* () {
    const tx = yield* store.begin();
    yield* tx.put(filePath, value);
    return yield* tx.commit({ message });
  });

const documentOp = (document: { json: () => unknown } | null | undefined): unknown => {
  const value = document?.json();
  return typeof value === "object" && value !== null && "op" in value
    ? (value as { readonly op?: unknown }).op
    : undefined;
};

describe("@cycle/git-db", () => {
  it.effect("creates a deterministic repository identity from the GitDB root commit", () =>
    Effect.gen(function* () {
      const store = yield* StoreApi.StoreService;
      const identity = yield* store.ensureRepositoryIdentity();
      const snapshot = yield* store.snapshot(identity.rootCommitId);
      const entries = yield* store.list("", { from: identity.rootCommitId });
      const reopened = yield* store.deriveRepositoryIdentity();

      assert.match(identity.repositoryId, /^repo_[0-9a-f]{5}$/u);
      assert.strictEqual(identity.repositoryId, `repo_${identity.rootCommitId.slice(0, 5)}`);
      assert.strictEqual(identity.source, "created");
      assert.strictEqual(snapshot.parents.length, 0);
      assert.match(snapshot.message ?? "", /^Initialize Cycle GitDB\n\nSeed: [0-9a-f]{32}$/u);
      assert.deepStrictEqual(entries, []);
      assert.deepStrictEqual(reopened, {
        ref: "refs/gitdb/cycle/main",
        repositoryId: identity.repositoryId,
        rootCommitId: identity.rootCommitId,
        source: "local",
      });
    }).pipe(Effect.provide(GitDbInMemory({ database: "cycle" }))),
  );

  it.effect("appends immutable canonical event files with blob deduplication", () =>
    Effect.gen(function* () {
      const store = yield* StoreApi.StoreService;
      const tx = yield* store.begin();
      const payload = {
        value: "in-progress",
        op: "update",
        field: "status",
      };

      const firstPath = yield* EventApi.append(tx, {
        aggregateId: "UKN-00001",
        aggregateType: "ticket",
        eventId: "evt_00001",
        payload,
      });
      const secondPath = yield* EventApi.append(tx, {
        aggregateId: "UKN-00002",
        aggregateType: "ticket",
        eventId: "evt_00002",
        payload: {
          field: "status",
          op: "update",
          value: "in-progress",
        },
      });
      yield* tx.put("collections/events/ticket/UKN-00003/evt_legacy.json", payload);

      const snapshot = yield* tx.commit({
        message: "Append ticket status events",
      });
      const first = yield* store.get(firstPath);
      const second = yield* store.get(secondPath);
      const events = yield* EventApi.list(store, { from: snapshot.id });
      const duplicate = yield* store.begin().pipe(
        Effect.flatMap((duplicateTx) =>
          EventApi.append(duplicateTx, {
            aggregateId: "UKN-00001",
            aggregateType: "ticket",
            eventId: "evt_00001",
            payload,
          }),
        ),
        Effect.flip,
      );
      const liveLikePath = yield* EventApi.path({
        aggregateId: "UKN-A7ABC",
        aggregateType: "ticket",
        eventId: "evt_live_like",
      });

      assert.ok(first !== null);
      assert.ok(second !== null);
      assert.strictEqual(first.text(), '{"field":"status","op":"update","value":"in-progress"}');
      assert.strictEqual(first.objectId, second.objectId);
      assert.ok(duplicate instanceof InvalidPathError);
      assert.strictEqual(liveLikePath, "collections/events/ticket/A7/UKN-A7ABC/evt_live_like.json");
      assert.deepStrictEqual(
        events.map((event) => ({
          aggregateId: event.aggregateId,
          aggregateType: event.aggregateType,
          eventId: event.eventId,
          path: event.path,
          payload: event.payload,
        })),
        [
          {
            aggregateId: "UKN-00001",
            aggregateType: "ticket",
            eventId: "evt_00001",
            path: "collections/events/ticket/00/UKN-00001/evt_00001.json",
            payload: {
              field: "status",
              op: "update",
              value: "in-progress",
            },
          },
          {
            aggregateId: "UKN-00002",
            aggregateType: "ticket",
            eventId: "evt_00002",
            path: "collections/events/ticket/00/UKN-00002/evt_00002.json",
            payload: {
              field: "status",
              op: "update",
              value: "in-progress",
            },
          },
          {
            aggregateId: "UKN-00003",
            aggregateType: "ticket",
            eventId: "evt_legacy",
            path: "collections/events/ticket/UKN-00003/evt_legacy.json",
            payload: {
              field: "status",
              op: "update",
              value: "in-progress",
            },
          },
        ],
      );
    }).pipe(Effect.provide(GitDbInMemory())),
  );

  it.effect("stores raw path documents and exposes tree, history, and diff reads", () =>
    Effect.gen(function* () {
      const store = yield* StoreApi.StoreService;
      const tx = yield* store.begin();

      yield* tx.put("scratch/provider.json", { enabled: true });
      yield* tx.put("scratch/readme.txt", "hello");

      const first = yield* tx.commit({
        message: "Create raw documents",
      });
      const next = yield* store.begin();

      yield* next.put("scratch/provider.json", { enabled: false });
      yield* next.delete("scratch/readme.txt");

      const second = yield* next.commit({
        message: "Update raw documents",
      });
      const provider = yield* store.get("scratch/provider.json");
      const readme = yield* store.get("scratch/readme.txt");
      const tree = yield* store.list("scratch");
      const history = yield* store.history("main");
      const diff = yield* store.diff(first.id, second.id);

      assert.deepStrictEqual(provider?.json(), { enabled: false });
      assert.strictEqual(readme, null);
      assert.deepStrictEqual(
        tree.map((entry) => entry.path),
        ["scratch/provider.json"],
      );
      assert.deepStrictEqual(
        history.map((snapshot) => snapshot.message),
        ["Update raw documents", "Create raw documents"],
      );
      assert.deepStrictEqual(
        diff.modified.map((change) => change.path),
        ["scratch/provider.json"],
      );
      assert.deepStrictEqual(
        diff.deleted.map((change) => change.path),
        ["scratch/readme.txt"],
      );
    }).pipe(Effect.provide(GitDbInMemory())),
  );

  it.effect("keeps raw transactions inactive after commit or abort", () =>
    Effect.gen(function* () {
      const store = yield* StoreApi.StoreService;
      const committed = yield* store.begin();
      const aborted = yield* store.begin();

      yield* committed.put("scratch/provider.json", { enabled: true });
      yield* committed.commit({ message: "Commit scratch document" });
      yield* aborted.put("scratch/aborted.json", { enabled: false });
      yield* aborted.abort();

      const putAfterCommit = yield* Effect.flip(
        committed.put("scratch/after-commit.json", { enabled: false }),
      );
      const putAfterAbort = yield* Effect.flip(
        aborted.put("scratch/after-abort.json", { enabled: false }),
      );

      assert.ok(putAfterCommit instanceof TransactionInactiveError);
      assert.ok(putAfterAbort instanceof TransactionInactiveError);
    }).pipe(Effect.provide(GitDbInMemory())),
  );

  it.effect("supports module-first store, transaction, pointer, snapshot, and sync helpers", () =>
    Effect.gen(function* () {
      const store = yield* StoreApi.StoreService;
      const tx = yield* TransactionApi.begin(store);

      yield* tx.put("scratch/provider.json", { enabled: true });

      const snapshot = yield* TransactionApi.commit(tx, {
        message: "Commit via helper",
      });
      const pointer = yield* PointerApi.get(store, "main");
      const current = yield* PointerApi.current(pointer);
      const read = yield* SnapshotApi.get(store, snapshot.id);
      const sync = yield* SyncApi.run(store, { mode: "fetch" });

      assert.strictEqual(current?.id, snapshot.id);
      assert.strictEqual(read.id, snapshot.id);
      assert.deepStrictEqual(sync.pointers, [
        {
          localAfter: snapshot.id,
          localBefore: snapshot.id,
          pointer: "main",
          remoteAfter: undefined,
          remoteBefore: undefined,
          status: "up-to-date",
        },
      ]);
    }).pipe(Effect.provide(GitDbInMemory())),
  );

  it.effect("reports missing remote GitDB refs for explicitly requested empty pointers", () =>
    Effect.gen(function* () {
      const store = yield* StoreApi.StoreService;
      const sync = yield* SyncApi.run(store, {
        mode: "full",
        pointers: ["main"],
        remote: "origin",
      });

      assert.deepStrictEqual(sync.pointers, [
        {
          localAfter: undefined,
          localBefore: undefined,
          pointer: "main",
          remoteAfter: undefined,
          remoteBefore: undefined,
          status: "missing-remote-gitdb-ref",
        },
      ]);
    }).pipe(Effect.provide(GitDbInMemory())),
  );

  it.effect("adopts the same root identity across checkouts through the remote GitDB ref", () =>
    withTempDir("cycle-gitdb-identity-", (root) =>
      Effect.gen(function* () {
        const remote = path.join(root, "origin.git");
        const first = path.join(root, "first");
        const second = path.join(root, "second");

        yield* attemptPromise(() => mkdir(first));
        yield* attemptPromise(() => mkdir(second));
        yield* git(root, ["init", "--bare", remote]);
        yield* git(first, ["init", "--initial-branch=main"]);
        yield* git(first, ["remote", "add", "origin", remote]);
        yield* git(second, ["init", "--initial-branch=main"]);
        yield* git(second, ["remote", "add", "origin", remote]);

        const firstStore = yield* storeFor(first);
        const secondStore = yield* storeFor(second);
        const firstIdentity = yield* firstStore.ensureRepositoryIdentity({ remote: "origin" });
        const secondIdentity = yield* secondStore.ensureRepositoryIdentity({ remote: "origin" });

        assert.strictEqual(firstIdentity.source, "created");
        assert.strictEqual(secondIdentity.source, "remote");
        assert.strictEqual(secondIdentity.rootCommitId, firstIdentity.rootCommitId);
        assert.strictEqual(secondIdentity.repositoryId, firstIdentity.repositoryId);
      }),
    ),
  );

  it.effect("rebases local GitDB commits onto fetched remote commits without merge commits", () =>
    withTempDir("cycle-gitdb-rebase-", (root) =>
      Effect.gen(function* () {
        const remote = path.join(root, "origin.git");
        const first = path.join(root, "first");
        const second = path.join(root, "second");

        yield* attemptPromise(() => mkdir(first));
        yield* attemptPromise(() => mkdir(second));
        yield* git(root, ["init", "--bare", remote]);
        yield* git(first, ["init", "--initial-branch=main"]);
        yield* git(first, ["remote", "add", "origin", remote]);
        yield* git(second, ["init", "--initial-branch=main"]);
        yield* git(second, ["remote", "add", "origin", remote]);

        const firstStore = yield* storeFor(first);
        const secondStore = yield* storeFor(second);
        const base = yield* commitDocument(
          firstStore,
          "collections/events/ticket/TKT-1/evt-base.json",
          { op: "base" },
          "Base event",
        );

        yield* SyncApi.run(firstStore, {
          mode: "full",
          onDiverged: "error",
          pointers: ["main"],
          remote: "origin",
        });
        yield* SyncApi.run(secondStore, {
          mode: "full",
          onDiverged: "error",
          pointers: ["main"],
          remote: "origin",
        });

        const local = yield* commitDocument(
          firstStore,
          "collections/events/ticket/TKT-1/evt-local.json",
          { op: "local" },
          "Local event",
        );
        const remoteSnapshot = yield* commitDocument(
          secondStore,
          "collections/events/ticket/TKT-2/evt-remote.json",
          { op: "remote" },
          "Remote event",
        );

        yield* SyncApi.run(secondStore, {
          mode: "full",
          onDiverged: "error",
          pointers: ["main"],
          remote: "origin",
        });

        const sync = yield* SyncApi.run(firstStore, {
          mode: "full",
          onDiverged: "rebase",
          pointers: ["main"],
          remote: "origin",
        });
        const result = sync.pointers[0];

        assert.strictEqual(result?.localBefore, local.id);
        assert.strictEqual(result?.remoteBefore, remoteSnapshot.id);
        assert.strictEqual(result?.status, "rebased");
        assert.ok(result?.localAfter);

        const rebased = yield* firstStore.snapshot(result.localAfter);
        assert.deepStrictEqual(rebased.parents, [remoteSnapshot.id]);
        assert.notStrictEqual(rebased.id, local.id);
        assert.strictEqual(
          documentOp(yield* firstStore.get("collections/events/ticket/TKT-1/evt-base.json")),
          "base",
        );
        assert.strictEqual(
          documentOp(yield* firstStore.get("collections/events/ticket/TKT-1/evt-local.json")),
          "local",
        );
        assert.strictEqual(
          documentOp(yield* firstStore.get("collections/events/ticket/TKT-2/evt-remote.json")),
          "remote",
        );
        assert.deepStrictEqual(base.parents, []);
      }),
    ),
  );

  it.effect("reports typed errors for invalid paths, pointers, snapshots, and JSON", () =>
    Effect.gen(function* () {
      const store = yield* StoreApi.StoreService;
      const invalidPut = yield* store.begin().pipe(
        Effect.flatMap((tx) => tx.put("../bad.json", {})),
        Effect.flip,
      );
      const missingPointer = yield* Effect.flip(
        store.pointer("missing").pipe(Effect.flatMap((p) => p.fork("copy"))),
      );
      const missingSnapshot = yield* Effect.flip(store.snapshot("not-a-snapshot"));
      const invalidEventSegment = yield* store.begin().pipe(
        Effect.flatMap((tx) =>
          EventApi.append(tx, {
            aggregateId: "bad/id",
            aggregateType: "ticket",
            eventId: "evt_1",
            payload: { op: "test" },
          }),
        ),
        Effect.flip,
      );
      const invalidEventPayload = yield* EventApi.canonicalJson({
        value: BigInt(1),
      }).pipe(Effect.flip);

      assert.ok(invalidPut instanceof InvalidPathError);
      assert.ok(missingPointer instanceof PointerNotFoundError);
      assert.ok(missingSnapshot instanceof SnapshotNotFoundError);
      assert.ok(invalidEventSegment instanceof InvalidPathError);
      assert.ok(invalidEventPayload instanceof InvalidJsonDocumentError);
    }).pipe(Effect.provide(GitDbInMemory())),
  );

  it.effect("maps pointer conflicts to typed errors", () =>
    Effect.gen(function* () {
      const store = yield* StoreApi.StoreService;
      const pointer = yield* store.pointer("main");
      const first = yield* store.begin();

      yield* first.put("scratch/one.json", { value: 1 });

      const firstSnapshot = yield* first.commit({ message: "First" });
      const second = yield* store.begin();

      yield* second.put("scratch/two.json", { value: 2 });

      const secondSnapshot = yield* second.commit({ message: "Second" });
      const conflict = yield* pointer
        .move(firstSnapshot.id, { expectedSnapshot: firstSnapshot.id })
        .pipe(Effect.flip);

      assert.ok(conflict instanceof PointerConflictError);
      assert.strictEqual(conflict.expected, firstSnapshot.id);
      assert.strictEqual(conflict.actual, secondSnapshot.id);
    }).pipe(Effect.provide(GitDbInMemory())),
  );

  it.effect("validates filesystem store configuration", () =>
    Effect.gen(function* () {
      const invalidNamespace = yield* StoreApi.StoreService.pipe(
        Effect.provide(
          GitDbFilesystem({
            allowBranchNamespace: false,
            cwd: "/tmp",
            namespace: "refs/heads/app",
            verifyGitDir: false,
          }),
        ),
        Effect.flip,
      );
      const missingStore = yield* StoreApi.StoreService.pipe(
        Effect.provide(
          GitDbFilesystem({
            cwd: path.join(os.tmpdir(), "missing-git-db-repo"),
          }),
        ),
        Effect.flip,
      );

      assert.ok(invalidNamespace instanceof InvalidNamespaceError);
      assert.strictEqual(missingStore._tag, "StoreNotFoundError");
    }),
  );
});
