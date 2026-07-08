import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NodeServices } from "@effect/platform-node";
import { Data, Effect, Layer } from "effect";
import {
  Document,
  EventAppendConflictError,
  EventStore,
  GitStores,
  ObjectCodec,
  ObjectCodecLive,
  RepositoryIdentity,
  TransactionInactiveError,
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

describe("@cycle/git-store", () => {
  it.effect("hashes canonical Git object bytes", () =>
    Effect.gen(function* () {
      const codec = yield* ObjectCodec;
      const id = yield* codec.hash("blob", encoder.encode("hello"));

      assert.strictEqual(id, "b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0");
    }).pipe(Effect.provide(ObjectCodecLive.pipe(Layer.provide(NodeServices.layer)))),
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
