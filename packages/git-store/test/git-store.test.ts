import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NodeServices } from "@effect/platform-node";
import { Data, Effect, Layer, Stream } from "effect";
import {
  Document,
  EventAppendConflictError,
  GitRemoteError,
  GitRemoteTransport,
  EventStore,
  GitSyncConflictError,
  GitStoreChanges,
  GitStoreSync,
  GitStores,
  ObjectCodec,
  ObjectCodecLive,
  RefReader,
  RefTransaction,
  RepositoryIdentity,
  TransactionInactiveError,
  aggregateEventPath,
  isSafeSegment,
  isValidRefName,
  parseEventMetadataPath,
} from "../src/index.ts";
import { GitStoresTestLive, withTestIdentity } from "../src/testing/index.ts";
import { assert, describe, it } from "./effect-vitest.ts";

const execFileAsync = promisify(execFile);
const encoder = new TextEncoder();

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

const withTempRepo = <A, E, R>(
  f: (repo: string) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | TestFailure, R> =>
  Effect.scoped(
    Effect.gen(function* () {
      const repo = yield* Effect.acquireRelease(
        attemptPromise(() => mkdtemp(path.join(os.tmpdir(), "cycle-git-store-"))),
        cleanupDir,
      );

      yield* attemptPromise(() =>
        execFileAsync("git", ["init", "--initial-branch=main"], { cwd: repo }),
      );

      return yield* f(repo);
    }),
  );

const makeTempRepo = Effect.acquireRelease(
  attemptPromise(() => mkdtemp(path.join(os.tmpdir(), "cycle-git-store-"))),
  cleanupDir,
).pipe(
  Effect.tap((repo) =>
    attemptPromise(() => execFileAsync("git", ["init", "--initial-branch=main"], { cwd: repo })),
  ),
);

const withTwoTempRepos = <A, E, R>(
  f: (firstRepo: string, secondRepo: string) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | TestFailure, R> =>
  Effect.scoped(
    Effect.gen(function* () {
      const firstRepo = yield* makeTempRepo;
      const secondRepo = yield* makeTempRepo;

      return yield* f(firstRepo, secondRepo);
    }),
  );

const repoOptions = (repo: string) =>
  withTestIdentity({
    commonGitDir: path.join(repo, ".git"),
    cwd: repo,
    database: "cycle",
    gitDir: path.join(repo, ".git"),
  });

const withTempBareRepo = <A, E, R>(
  f: (repo: string) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | TestFailure, R> =>
  Effect.scoped(
    Effect.gen(function* () {
      const repo = yield* Effect.acquireRelease(
        attemptPromise(() => mkdtemp(path.join(os.tmpdir(), "cycle-git-store-remote-"))),
        cleanupDir,
      );

      yield* attemptPromise(() =>
        execFileAsync("git", ["init", "--bare", "--initial-branch=main"], { cwd: repo }),
      );

      return yield* f(repo);
    }),
  );

describe("@cycle/git-store", () => {
  it.effect("hashes canonical Git object bytes", () =>
    Effect.gen(function* () {
      const codec = yield* ObjectCodec;
      const id = yield* codec.hash("blob", encoder.encode("hello"));

      assert.strictEqual(id, "b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0");
    }).pipe(Effect.provide(ObjectCodecLive.pipe(Layer.provide(NodeServices.layer)))),
  );

  it("accepts Git-compatible ref names without relaxing safe segments", () => {
    assert.strictEqual(isValidRefName("refs/heads/bugfix./pos-hub-fulfillment-types"), true);
    assert.strictEqual(isValidRefName("refs/heads/release+2026@cycle"), true);
    assert.strictEqual(isValidRefName("refs/heads/bugfix."), false);
    assert.strictEqual(isSafeSegment("bugfix."), false);
    assert.strictEqual(isSafeSegment("release+2026@cycle"), false);
  });

  it.effect("reads packed refs with intermediate segments ending in dot", () =>
    withTempRepo((repo) =>
      Effect.gen(function* () {
        const branch = "refs/heads/bugfix./pos-hub-fulfillment-types";
        const target = "1234567890abcdef1234567890abcdef12345678";

        yield* attemptPromise(() =>
          writeFile(
            path.join(repo, ".git", "packed-refs"),
            `# pack-refs with: peeled fully-peeled sorted\n${target} ${branch}\n`,
            "utf8",
          ),
        );

        const stores = yield* GitStores;
        const options = withTestIdentity({ cwd: repo, database: "cycle" });
        const read = yield* (stores.withStore(options, () =>
          Effect.gen(function* () {
            const refs = yield* RefReader;

            return yield* refs.read(branch);
          }),
        ) as Effect.Effect<string | null, unknown>);

        assert.strictEqual(read, target);
      }).pipe(Effect.provide(GitStoresTestLive)),
    ),
  );

  it.effect("reuses store instances across calls until invalidated", () =>
    withTempRepo((repo) =>
      Effect.gen(function* () {
        const stores = yield* GitStores;
        const options = withTestIdentity({ cwd: repo, database: "cycle" });
        const first = yield* stores.withStore(options, (store) => Effect.succeed(store));
        const second = yield* stores.withStore(options, (store) => Effect.succeed(store));

        yield* stores.invalidate(options);

        const third = yield* stores.withStore(options, (store) => Effect.succeed(store));

        assert.strictEqual(first, second);
        assert.notStrictEqual(third, first);
      }).pipe(Effect.provide(GitStoresTestLive)),
    ),
  );

  it.effect(
    "commits documents through scoped transactions and exposes reads, history, and diffs",
    () =>
      withTempRepo((repo) =>
        Effect.gen(function* () {
          const stores = yield* GitStores;
          const options = withTestIdentity({ cwd: repo, database: "cycle" });

          let captured: import("../src/GitStore.ts").GitStoreTransaction | undefined;
          const first = yield* stores.withStore(options, (store) =>
            store.transaction({ message: "Create ticket" }, (tx) =>
              Effect.gen(function* () {
                yield* Effect.sync(() => {
                  captured = tx;
                });
                yield* tx.put(
                  "tickets/TCK-1.json",
                  Document.json({ status: "open", title: "One" }),
                );

                return yield* tx.list("tickets");
              }),
            ),
          );
          const second = yield* stores.withStore(options, (store) =>
            store.transaction({ message: "Update ticket" }, (tx) =>
              Effect.gen(function* () {
                yield* tx.put(
                  "tickets/TCK-1.json",
                  Document.json({ status: "closed", title: "One" }),
                );
                yield* tx.put("notes/TCK-1.txt", Document.text("done\n"));
              }),
            ),
          );
          const reads = yield* stores.withStore(options, (store) =>
            Effect.gen(function* () {
              const document = yield* store.get("tickets/TCK-1.json");
              const history = yield* store.history("main");
              const diff = yield* store.diff(first.snapshot.id, second.snapshot.id);
              const inactive = yield* Effect.flip(captured!.get("tickets/TCK-1.json"));

              return { diff, document, history, inactive };
            }),
          );

          assert.deepStrictEqual(
            first.value.map((entry) => entry.path),
            ["tickets/TCK-1.json"],
          );
          assert.deepStrictEqual(reads.document?.json(), { status: "closed", title: "One" });
          assert.deepStrictEqual(
            reads.history.map((snapshot) => snapshot.message),
            ["Update ticket", "Create ticket"],
          );
          assert.deepStrictEqual(
            reads.diff.modified.map((change) => change.path),
            ["tickets/TCK-1.json"],
          );
          assert.deepStrictEqual(
            reads.diff.added.map((change) => change.path),
            ["notes/TCK-1.txt"],
          );
          assert.ok(reads.inactive instanceof TransactionInactiveError);
        }).pipe(Effect.provide(GitStoresTestLive)),
      ),
  );

  it.effect("reads documents and history from packed object files", () =>
    withTempRepo((repo) =>
      Effect.gen(function* () {
        const stores = yield* GitStores;
        const options = withTestIdentity({ cwd: repo, database: "cycle" });
        const snapshot = yield* (stores.withStore(options, (store) =>
          store.transaction({ message: "Pack me" }, (tx) =>
            tx.put("tickets/TCK-1.json", Document.json({ status: "open" })),
          ),
        ) as Effect.Effect<import("../src/GitStore.ts").TransactionResult<void>, unknown>);

        yield* attemptPromise(() => execFileAsync("git", ["repack", "-ad"], { cwd: repo }));
        yield* attemptPromise(() => execFileAsync("git", ["prune-packed"], { cwd: repo }));

        const read = yield* (stores.withStore(options, (store) =>
          Effect.gen(function* () {
            const document = yield* store.get("tickets/TCK-1.json");
            const history = yield* store.history("main");

            return { document, history };
          }),
        ) as Effect.Effect<
          {
            readonly document: Document | null;
            readonly history: ReadonlyArray<import("../src/GitStoreSchemas.ts").Snapshot>;
          },
          unknown
        >);

        assert.deepStrictEqual(read.document?.json(), { status: "open" });
        assert.strictEqual(read.history[0]?.id, snapshot.snapshot.id);
      }).pipe(Effect.provide(GitStoresTestLive)),
    ),
  );

  it.effect("emits active store ref changes for local and externally observed ref moves", () =>
    withTempRepo((repo) =>
      Effect.gen(function* () {
        const stores = yield* GitStores;
        const options = withTestIdentity({ cwd: repo, database: "cycle" });
        const changes = yield* stores.withStore(options, (store) =>
          Effect.gen(function* () {
            const refChanges = yield* GitStoreChanges;
            const refTx = yield* RefTransaction;
            const ref = yield* store.pointerRef("main");

            yield* refChanges.poll({ ref });

            const first = yield* store.transaction({ message: "First change" }, (tx) =>
              tx.put("tickets/TCK-1.json", Document.json({ status: "open" })),
            );
            const incoming = yield* store.transaction(
              { message: "Incoming change", pointer: "incoming" },
              (tx) => tx.put("tickets/TCK-2.json", Document.json({ status: "open" })),
            );

            yield* refTx.update(ref, incoming.snapshot.id, { expected: first.snapshot.id });
            yield* refChanges.poll({ ref, source: "external" });

            const emitted = yield* refChanges.changes.pipe(Stream.take(2), Stream.runCollect);

            return Array.from(emitted);
          }),
        ) as unknown as Effect.Effect<
          ReadonlyArray<import("../src/GitStoreChanges.ts").GitStoreRefChange>,
          unknown
        >;

        assert.strictEqual(changes[0]?.source, "local");
        assert.strictEqual(changes[0]?.before, null);
        assert.match(changes[0]?.after ?? "", /^[0-9a-f]{40}$/u);
        assert.strictEqual(changes[1]?.source, "external");
        assert.strictEqual(changes[1]?.before, changes[0]?.after);
        assert.match(changes[1]?.after ?? "", /^[0-9a-f]{40}$/u);
      }).pipe(Effect.provide(GitStoresTestLive)),
    ),
  );

  it.effect("pushes with a remote lease and pulls by fast-forwarding the local ref", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const remote = yield* Effect.acquireRelease(
          attemptPromise(() => mkdtemp(path.join(os.tmpdir(), "cycle-git-store-remote-"))),
          cleanupDir,
        );

        yield* attemptPromise(() =>
          execFileAsync("git", ["init", "--bare", "--initial-branch=main"], { cwd: remote }),
        );

        return yield* withTempRepo((repo) =>
          Effect.gen(function* () {
            yield* attemptPromise(() =>
              execFileAsync("git", ["remote", "add", "origin", remote], { cwd: repo }),
            );

            const stores = yield* GitStores;
            const options = withTestIdentity({ cwd: repo, database: "cycle" });
            const result = yield* stores.withStore(options, (store) =>
              Effect.gen(function* () {
                const refTx = yield* RefTransaction;
                const sync = yield* GitStoreSync;
                const ref = yield* store.pointerRef("main");

                const first = yield* store.transaction({ message: "First remote state" }, (tx) =>
                  tx.put("tickets/TCK-1.json", Document.json({ status: "open" })),
                );
                const pushFirst = yield* sync.push();
                const second = yield* store.transaction({ message: "Second remote state" }, (tx) =>
                  tx.put("tickets/TCK-2.json", Document.json({ status: "open" })),
                );
                const pushSecond = yield* sync.sync();

                yield* refTx.update(ref, first.snapshot.id, { expected: second.snapshot.id });
                const pull = yield* sync.pull();
                yield* refTx.update(ref, first.snapshot.id, { expected: second.snapshot.id });
                const divergent = yield* store.transaction(
                  { message: "Divergent local state" },
                  (tx) => tx.put("tickets/TCK-3.json", Document.json({ status: "open" })),
                );
                const conflict = yield* Effect.flip(sync.pull());

                return {
                  current: yield* store.resolveSnapshotId(),
                  conflict,
                  divergent: divergent.snapshot.id,
                  first: first.snapshot.id,
                  pull,
                  pushFirst,
                  pushSecond,
                  second: second.snapshot.id,
                };
              }),
            ) as unknown as Effect.Effect<
              {
                readonly conflict: unknown;
                readonly current: string | null;
                readonly divergent: string;
                readonly first: string;
                readonly pull: import("../src/GitStoreSync.ts").GitSyncResult;
                readonly pushFirst: import("../src/GitStoreSync.ts").GitSyncResult;
                readonly pushSecond: import("../src/GitStoreSync.ts").GitSyncResult;
                readonly second: string;
              },
              unknown
            >;

            const pushFirst = result.pushFirst.pointers[0];
            const pushSecond = result.pushSecond.pointers[0];
            const pull = result.pull.pointers[0];

            assert.strictEqual(pushFirst?.status, "pushed");
            assert.strictEqual(pushFirst?.remoteBefore, undefined);
            assert.strictEqual(pushSecond?.status, "pushed");
            assert.strictEqual(pushSecond?.remoteBefore, result.first);
            assert.strictEqual(pull?.status, "fast-forwarded");
            assert.strictEqual(pull?.localBefore, result.first);
            assert.strictEqual(pull?.localAfter, result.second);
            assert.ok(result.conflict instanceof GitSyncConflictError);
            assert.strictEqual(result.current, result.divergent);
          }).pipe(Effect.provide(GitStoresTestLive)),
        );
      }),
    ),
  );

  it.effect("adopts repository identity from the remote git-store ref", () =>
    withTempBareRepo((remote) =>
      withTwoTempRepos((firstRepo, secondRepo) =>
        Effect.gen(function* () {
            yield* attemptPromise(() =>
              execFileAsync("git", ["remote", "add", "origin", remote], { cwd: firstRepo }),
            );
            yield* attemptPromise(() =>
              execFileAsync("git", ["remote", "add", "origin", remote], { cwd: secondRepo }),
            );

            const stores = yield* GitStores;
            const firstOptions = repoOptions(firstRepo);
            const secondOptions = repoOptions(secondRepo);
            const first = yield* stores.withStore(firstOptions, () =>
              Effect.gen(function* () {
                const identity = yield* RepositoryIdentity;
                const sync = yield* GitStoreSync;
                const ensured = yield* identity.ensureIdentity({ remote: "origin" });

                yield* sync.push({ remote: "origin" });

                return ensured;
              }),
            ) as unknown as Effect.Effect<
              import("../src/RepositoryIdentity.ts").RepositoryIdentityInfo,
              unknown
            >;
            const adopted = yield* stores.withStore(secondOptions, () =>
              Effect.gen(function* () {
                const identity = yield* RepositoryIdentity;
                const ensured = yield* identity.ensureIdentity({ remote: "origin" });
                const resolved = yield* identity.resolveIdentity();

                return { ensured, resolved };
              }),
            ) as unknown as Effect.Effect<
              {
                readonly ensured: import("../src/RepositoryIdentity.ts").RepositoryIdentityInfo;
                readonly resolved: import("../src/RepositoryIdentity.ts").RepositoryIdentityInfo | null;
              },
              unknown
            >;

            assert.strictEqual(adopted.ensured.repositoryId, first.repositoryId);
            assert.strictEqual(adopted.ensured.rootCommitId, first.rootCommitId);
            assert.deepStrictEqual(adopted.resolved, adopted.ensured);
        }).pipe(Effect.provide(GitStoresTestLive)),
      ),
    ),
  );

  it.effect("rebases divergent local commits during full sync", () =>
    withTempBareRepo((remote) =>
      withTwoTempRepos((firstRepo, secondRepo) =>
        Effect.gen(function* () {
            yield* attemptPromise(() =>
              execFileAsync("git", ["remote", "add", "origin", remote], { cwd: firstRepo }),
            );
            yield* attemptPromise(() =>
              execFileAsync("git", ["remote", "add", "origin", remote], { cwd: secondRepo }),
            );

            const stores = yield* GitStores;
            const firstOptions = repoOptions(firstRepo);
            const secondOptions = repoOptions(secondRepo);
            const base = yield* stores.withStore(firstOptions, (store) =>
              Effect.gen(function* () {
                const sync = yield* GitStoreSync;
                const base = yield* store.transaction({ message: "Base" }, (tx) =>
                  tx.put("tickets/base.json", Document.json({ title: "Base" })),
                );

                yield* sync.push({ remote: "origin" });

                return base.snapshot.id;
              }),
            ) as unknown as Effect.Effect<string, unknown>;
            const local = yield* stores.withStore(secondOptions, (store) =>
              Effect.gen(function* () {
                const sync = yield* GitStoreSync;

                yield* sync.pull({ remote: "origin" });
                const local = yield* store.transaction({ message: "Local change" }, (tx) =>
                  tx.put("tickets/local.json", Document.json({ title: "Local" })),
                );

                return local.snapshot.id;
              }),
            ) as unknown as Effect.Effect<string, unknown>;
            const remoteCommit = yield* stores.withStore(firstOptions, (store) =>
              Effect.gen(function* () {
                const sync = yield* GitStoreSync;
                const remoteChange = yield* store.transaction({ message: "Remote change" }, (tx) =>
                  tx.put("tickets/remote.json", Document.json({ title: "Remote" })),
                );

                yield* sync.push({ remote: "origin" });

                return remoteChange.snapshot.id;
              }),
            ) as unknown as Effect.Effect<string, unknown>;
            const second = yield* stores.withStore(secondOptions, (store) =>
              Effect.gen(function* () {
                const sync = yield* GitStoreSync;
                const result = yield* sync.sync({
                  mode: "full",
                  onDiverged: "rebase",
                  remote: "origin",
                });
                const localDocument = yield* store.get("tickets/local.json");
                const remoteDocument = yield* store.get("tickets/remote.json");

                return {
                  localDocument,
                  remoteDocument,
                  result,
                };
              }),
            ) as unknown as Effect.Effect<
              {
                readonly localDocument: Document | null;
                readonly remoteDocument: Document | null;
                readonly result: import("../src/GitStoreSync.ts").GitSyncResult;
              },
              unknown
            >;
            const pointer = second.result.pointers[0];

            assert.strictEqual(pointer?.status, "rebased");
            assert.strictEqual(pointer?.localBefore, local);
            assert.strictEqual(pointer?.remoteBefore, remoteCommit);
            assert.strictEqual(pointer?.remoteAfter, pointer?.localAfter);
            assert.notStrictEqual(pointer?.localAfter, local);
            assert.deepStrictEqual(second.localDocument?.json(), { title: "Local" });
            assert.deepStrictEqual(second.remoteDocument?.json(), { title: "Remote" });
            assert.notStrictEqual(base, remoteCommit);
        }).pipe(Effect.provide(GitStoresTestLive)),
      ),
    ),
  );

  it.effect("preserves git push stderr and status in remote errors", () =>
    withTempBareRepo((remote) =>
      withTempRepo((repo) =>
        Effect.gen(function* () {
          yield* attemptPromise(() =>
            execFileAsync("git", ["remote", "add", "origin", remote], { cwd: repo }),
          );

          const stores = yield* GitStores;
          const options = withTestIdentity({ cwd: repo, database: "cycle" });
          const failure = yield* stores.withStore(options, (store) =>
            Effect.gen(function* () {
              const transport = yield* GitRemoteTransport;
              const ref = yield* store.pointerRef("main");
              const first = yield* store.transaction({ message: "First" }, (tx) =>
                tx.put("tickets/first.json", Document.json({ title: "First" })),
              );

              yield* transport.push({
                cwd: repo,
                expected: null,
                ref,
                remote: "origin",
                target: first.snapshot.id,
              });

              const second = yield* store.transaction({ message: "Second" }, (tx) =>
                tx.put("tickets/second.json", Document.json({ title: "Second" })),
              );

              return yield* Effect.flip(
                transport.push({
                  cwd: repo,
                  expected:
                    "0000000000000000000000000000000000000000" as import("../src/GitStoreSchemas.ts").ObjectId,
                  ref,
                  remote: "origin",
                  target: second.snapshot.id,
                }),
              );
            }),
          ) as unknown as Effect.Effect<unknown, unknown>;

          assert.ok(failure instanceof GitRemoteError);
          assert.strictEqual(typeof failure.stderr, "string");
          assert.ok((failure.stderr ?? "").length > 0);
          assert.strictEqual(typeof failure.status, "number");
        }).pipe(Effect.provide(GitStoresTestLive)),
      ),
    ),
  );

  it.effect("appends canonical event files and reads ticket shard plus legacy paths", () =>
    withTempRepo((repo) =>
      Effect.gen(function* () {
        const stores = yield* GitStores;
        const options = withTestIdentity({ cwd: repo, database: "cycle" });
        const snapshot = yield* stores.withStore(options, (store) =>
          Effect.gen(function* () {
            const events = yield* EventStore;

            return yield* store.transaction({ message: "Append events" }, (tx) =>
              Effect.gen(function* () {
                yield* events.append(tx, {
                  aggregateId: "UKN-A7ABC",
                  aggregateType: "ticket",
                  eventId: "evt_1",
                  payload: { z: 2, a: 1 },
                });
                yield* tx.put(
                  "collections/events/ticket/UKN-LEGACY/evt_legacy.json",
                  Document.json({ legacy: true }),
                );
              }),
            );
          }),
        ) as Effect.Effect<import("../src/GitStore.ts").TransactionResult<void>, unknown>;
        const read = yield* stores.withStore(options, () =>
          Effect.gen(function* () {
            const events = yield* EventStore;
            const duplicate = yield* Effect.flip(
              stores.withStore(options, (store) =>
                store.transaction({ message: "Duplicate" }, (tx) =>
                  events.append(tx, {
                    aggregateId: "UKN-A7ABC",
                    aggregateType: "ticket",
                    eventId: "evt_1",
                    payload: { a: 1, z: 2 },
                  }),
                ),
              ),
            );

            return {
              duplicate,
              events: yield* events.list({ from: snapshot.snapshot.id }),
            };
          }),
        ) as Effect.Effect<
          {
            readonly duplicate: unknown;
            readonly events: ReadonlyArray<import("../src/EventStore.ts").EventDocument>;
          },
          unknown
        >;

        assert.deepStrictEqual(
          read.events.map((event) => [event.path, event.payload]),
          [
            ["collections/events/ticket/A7/UKN-A7ABC/evt_1.json", { a: 1, z: 2 }],
            ["collections/events/ticket/UKN-LEGACY/evt_legacy.json", { legacy: true }],
          ],
        );
        assert.ok(read.duplicate instanceof EventAppendConflictError);
      }).pipe(Effect.provide(GitStoresTestLive)),
    ),
  );

  it("exposes public event aggregate and parse helpers", () => {
    const ticketPath = aggregateEventPath({
      aggregateId: "UKN-A7ABC",
      aggregateType: "ticket",
    });
    const userPath = aggregateEventPath({
      aggregateId: "user@example.invalid",
      aggregateType: "user",
    });

    assert.strictEqual(ticketPath, "collections/events/ticket/A7/UKN-A7ABC");
    assert.strictEqual(userPath, "collections/events/user/user@example.invalid");
    assert.deepStrictEqual(parseEventMetadataPath(`${ticketPath}/evt_1.json`), {
      aggregateId: "UKN-A7ABC",
      aggregateType: "ticket",
      eventId: "evt_1",
      path: "collections/events/ticket/A7/UKN-A7ABC/evt_1.json",
    });
    assert.strictEqual(parseEventMetadataPath("tickets/UKN-A7ABC.json"), null);
  });

  it.effect("initializes and resolves repository identity from the Cycle GitDB root commit", () =>
    withTempRepo((repo) =>
      Effect.gen(function* () {
        const stores = yield* GitStores;
        const options = withTestIdentity({ cwd: repo, database: "cycle" });
        const identity = yield* stores.withStore(options, () =>
          Effect.gen(function* () {
            const identities = yield* RepositoryIdentity;
            const before = yield* identities.resolveIdentity();
            const ensured = yield* identities.ensureIdentity();
            const after = yield* identities.resolveIdentity();

            return { after, before, ensured };
          }),
        ) as Effect.Effect<
          {
            readonly after: import("../src/RepositoryIdentity.ts").RepositoryIdentityInfo | null;
            readonly before: import("../src/RepositoryIdentity.ts").RepositoryIdentityInfo | null;
            readonly ensured: import("../src/RepositoryIdentity.ts").RepositoryIdentityInfo;
          },
          unknown
        >;

        assert.strictEqual(identity.before, null);
        assert.match(identity.ensured.repositoryId, /^repo_[0-9a-f]{5}$/u);
        assert.deepStrictEqual(identity.after, identity.ensured);
      }).pipe(Effect.provide(GitStoresTestLive)),
    ),
  );
});
