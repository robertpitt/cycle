import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Effect } from "effect";
import {
  Collection as CollectionApi,
  GitDbFilesystem,
  GitDbInMemory,
  GitDbLive,
  InvalidIdentifierError,
  InvalidJsonDocumentError,
  InvalidNamespaceError,
  InvalidPathError,
  InvalidPointerNameError,
  Pointer as PointerApi,
  PointerConflictError,
  PointerNotFoundError,
  Snapshot as SnapshotApi,
  SnapshotNotFoundError,
  Store as StoreApi,
  Sync as SyncApi,
  SyncConflictError,
  Transaction as TransactionApi,
  TransactionInactiveError,
} from "../src/index.ts";
import { assert, describe, it } from "./effect-vitest.ts";

const execFileAsync = promisify(execFile);

const attemptPromise = <A>(try_: () => Promise<A>): Effect.Effect<A, unknown> =>
  Effect.tryPromise({
    catch: (cause) => cause,
    try: try_,
  });

const git = (cwd: string, args: ReadonlyArray<string>): Effect.Effect<string, unknown> =>
  attemptPromise(async () => {
    const { stdout } = await execFileAsync("git", [...args], { cwd });
    return stdout;
  });

const createRepo = (): Effect.Effect<string, unknown> =>
  Effect.gen(function* () {
    const repo = yield* attemptPromise(() => mkdtemp(path.join(os.tmpdir(), "git-db-")));

    yield* git(repo, ["init", "--initial-branch=main"]);
    yield* attemptPromise(() => writeFile(path.join(repo, "source.txt"), "source\n"));
    yield* git(repo, ["add", "source.txt"]);
    yield* git(repo, [
      "-c",
      "user.name=Test User",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "Initial source commit",
    ]);

    return repo;
  });

const cleanupDir = (dir: string): Effect.Effect<void, never> =>
  attemptPromise(() => rm(dir, { force: true, recursive: true })).pipe(Effect.orDie);

const withRepo = <A, E, R>(
  f: (repo: string) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | unknown, R> =>
  Effect.scoped(
    Effect.gen(function* () {
      const repo = yield* Effect.acquireRelease(createRepo(), cleanupDir);

      return yield* f(repo);
    }),
  );

const withTempDir = <A, E, R>(
  prefix: string,
  f: (dir: string) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | unknown, R> =>
  Effect.scoped(
    Effect.gen(function* () {
      const dir = yield* Effect.acquireRelease(
        attemptPromise(() => mkdtemp(path.join(os.tmpdir(), prefix))),
        cleanupDir,
      );

      return yield* f(dir);
    }),
  );

const hashFile = (file: string): Effect.Effect<string, unknown> =>
  attemptPromise(() => readFile(file)).pipe(
    Effect.map((bytes) => createHash("sha1").update(bytes).digest("hex")),
  );

const documentStorePath = (collection: string, id: string, extension = "json"): string =>
  `collections/${collection}/${createHash("sha1").update(id).digest("hex").slice(0, 2)}/${id}.${extension}`;

describe("@cycle/git-db", () => {
  it.effect("stores collection documents through replaceable Effect services", () =>
    Effect.gen(function* () {
      const store = yield* StoreApi.StoreService;
      const tx = yield* store.begin();
      const providers = yield* tx.collection<{
        readonly enabled: boolean;
        readonly name: string;
        readonly type: string;
      }>("providers");

      yield* providers.setMeta({
        label: "Payment providers",
      });
      yield* providers.put("stripe", {
        enabled: true,
        name: "Stripe",
        type: "payment",
      });
      yield* providers.put("adyen", {
        enabled: false,
        name: "Adyen",
        type: "payment",
      });

      const snapshot = yield* tx.commit({
        message: "Add payment provider configuration",
      });
      const collection = yield* store.collection<{
        readonly enabled: boolean;
        readonly name: string;
        readonly type: string;
      }>("providers");

      assert.deepStrictEqual(snapshot.parents, []);
      assert.deepStrictEqual(yield* collection.get("stripe"), {
        enabled: true,
        name: "Stripe",
        type: "payment",
      });
      assert.deepStrictEqual(yield* collection.meta<{ readonly label: string }>(), {
        label: "Payment providers",
      });
      assert.deepStrictEqual(yield* store.collections(), [
        {
          meta: {
            label: "Payment providers",
          },
          name: "providers",
          path: "collections/providers",
        },
      ]);
      assert.strictEqual(yield* store.get(".store/manifest.json"), null);
      assert.deepStrictEqual(yield* store.list("indexes"), []);
    }).pipe(Effect.provide(GitDbInMemory())),
  );

  it.effect("reads raw documents, raw trees, metadata, and deletes collection entries", () =>
    Effect.gen(function* () {
      const store = yield* StoreApi.StoreService;
      const providers = yield* store.collection<{
        readonly enabled: boolean;
        readonly name: string;
        readonly tags?: ReadonlyArray<string>;
        readonly type: string;
      }>("providers");
      const stripePath = documentStorePath("providers", "stripe");
      const adyenPath = documentStorePath("providers", "adyen");

      yield* providers.setMeta(
        {
          label: "Payment providers",
          owner: "platform",
        },
        {
          message: "Label provider collection",
        },
      );
      yield* providers.put(
        "stripe",
        {
          enabled: true,
          name: "Stripe",
          tags: ["payment", "card", "live"],
          type: "payment",
        },
        {
          message: "Add Stripe provider",
        },
      );
      yield* providers.put(
        "adyen",
        {
          enabled: false,
          name: "Adyen",
          type: "payment",
        },
        {
          message: "Add Adyen provider",
        },
      );

      const stripeDocument = yield* providers.document("stripe");
      const rawDocument = yield* store.get(stripePath);
      const providerTree = yield* store.list("collections/providers");
      const entries = yield* providers.list();

      assert.ok(stripeDocument !== null);
      assert.ok(rawDocument !== null);
      assert.strictEqual(stripeDocument.path, stripePath);
      assert.strictEqual(rawDocument.path, stripePath);
      assert.strictEqual(stripeDocument.objectId, rawDocument.objectId);
      assert.strictEqual(
        stripeDocument.text(),
        '{"enabled":true,"name":"Stripe","tags":["payment","card","live"],"type":"payment"}\n',
      );
      assert.deepStrictEqual(stripeDocument.json(), {
        enabled: true,
        name: "Stripe",
        tags: ["payment", "card", "live"],
        type: "payment",
      });
      assert.strictEqual(stripeDocument.size, stripeDocument.bytes.byteLength);
      assert.deepStrictEqual(
        providerTree.map((entry) => entry.name).sort(),
        [".meta.json", adyenPath.split("/")[2], stripePath.split("/")[2]].sort(),
      );
      assert.deepStrictEqual(entries.map((entry) => entry.id).sort(), ["adyen", "stripe"]);
      assert.deepStrictEqual(yield* store.list("indexes"), []);
      assert.deepStrictEqual(yield* providers.meta(), {
        label: "Payment providers",
        owner: "platform",
      });

      yield* providers.delete("stripe", {
        message: "Remove Stripe provider",
      });

      assert.strictEqual(yield* providers.get("stripe"), null);
      assert.strictEqual(yield* store.get(stripePath), null);
      assert.deepStrictEqual(
        (yield* providers.list()).map((entry) => entry.id),
        ["adyen"],
      );
      assert.deepStrictEqual(yield* store.list("indexes"), []);
    }).pipe(Effect.provide(GitDbInMemory())),
  );

  it.effect("supports custom collection document codecs and extensions", () =>
    Effect.gen(function* () {
      type Note = {
        readonly status: string;
        readonly title: string;
      };

      const store = yield* StoreApi.StoreService;
      const notes = yield* store.collection<Note>("notes", {
        codec: {
          decode: (document) => {
            const [statusLine, titleLine] = document.text().trimEnd().split("\n");

            return {
              status: statusLine!.slice("status: ".length),
              title: titleLine!.slice("# ".length),
            };
          },
          encode: (note) => `status: ${note.status}\n# ${note.title}\n`,
        },
        extension: "md",
      });

      yield* notes.put("note-1", {
        status: "open",
        title: "Markdown note",
      });

      const path = documentStorePath("notes", "note-1", "md");
      const rawDocument = yield* store.get(path);

      assert.ok(rawDocument !== null);
      assert.deepStrictEqual(yield* store.list("indexes"), []);
      assert.strictEqual(rawDocument.text(), "status: open\n# Markdown note\n");
      assert.deepStrictEqual(yield* notes.get("note-1"), {
        status: "open",
        title: "Markdown note",
      });
      assert.deepStrictEqual(
        (yield* notes.list()).map((entry) => entry.id),
        ["note-1"],
      );
    }).pipe(Effect.provide(GitDbInMemory())),
  );

  it.effect("pages collection results by cursor before hydrating blobs", () =>
    Effect.gen(function* () {
      const store = yield* StoreApi.StoreService;
      const candidates = ["item-1", "item-2", "item-3", "item-4"]
        .map((id) => ({
          id,
          path: documentStorePath("items", id),
        }))
        .sort((a, b) => a.path.localeCompare(b.path));
      const first = candidates[0]!;
      const invalid = candidates[1]!;
      const third = candidates[2]!;
      const fourth = candidates[3]!;
      const tx = yield* store.begin();

      yield* tx.put(first.path, {
        rank: 1,
        title: first.id,
      });
      yield* tx.put(invalid.path, "not-json");
      yield* tx.put(third.path, {
        rank: 3,
        title: third.id,
      });
      yield* tx.put(fourth.path, {
        rank: 4,
        title: fourth.id,
      });
      yield* tx.commit({ message: "Create paged items" });

      const items = yield* store.collection<{
        readonly rank: number;
        readonly title: string;
      }>("items");
      const firstPage = yield* items.page({ limit: 1 });
      const invalidPage = yield* Effect.flip(
        items.page({ cursor: firstPage.nextCursor, limit: 1 }),
      );
      const thirdPage = yield* items.page({ cursor: invalid.path, limit: 1 });
      const invalidLimit = yield* Effect.flip(items.page({ limit: 0 }));

      assert.deepStrictEqual(
        firstPage.entries.map((entry) => entry.id),
        [first.id],
      );
      assert.strictEqual(firstPage.nextCursor, first.path);
      assert.ok(invalidPage instanceof InvalidJsonDocumentError);
      assert.deepStrictEqual(
        thirdPage.entries.map((entry) => entry.id),
        [third.id],
      );
      assert.strictEqual(thirdPage.nextCursor, third.path);
      assert.ok(invalidLimit instanceof InvalidIdentifierError);

      const tickets = yield* store.collection<{
        readonly status: string;
        readonly title: string;
      }>("tickets");
      const ticketCandidates = ["ticket-1", "ticket-2", "ticket-3"]
        .map((id) => ({
          id,
          path: documentStorePath("tickets", id),
        }))
        .sort((a, b) => a.path.localeCompare(b.path));

      yield* tickets.put("ticket-1", {
        status: "open",
        title: "First",
      });
      yield* tickets.put("ticket-2", {
        status: "open",
        title: "Second",
      });
      yield* tickets.put("ticket-3", {
        status: "open",
        title: "Third",
      });

      const openFirstPage = yield* tickets.page({ limit: 2 });
      const openSecondPage = yield* tickets.page({
        cursor: openFirstPage.nextCursor,
        limit: 2,
      });

      assert.deepStrictEqual(
        openFirstPage.entries.map((entry) => entry.id),
        ticketCandidates.slice(0, 2).map((entry) => entry.id),
      );
      assert.strictEqual(openFirstPage.nextCursor, ticketCandidates[1]?.path);
      assert.deepStrictEqual(
        openSecondPage.entries.map((entry) => entry.id),
        ticketCandidates.slice(2).map((entry) => entry.id),
      );
      assert.strictEqual(openSecondPage.nextCursor, undefined);
    }).pipe(Effect.provide(GitDbInMemory())),
  );

  it.effect("keeps collection writes free of derived index entries", () =>
    Effect.gen(function* () {
      type Ticket = {
        readonly assignee?: string | null | undefined;
        readonly author?: string;
        readonly metadata?: unknown;
        readonly status: string;
        readonly tags?: ReadonlyArray<string>;
      };

      const store = yield* StoreApi.StoreService;
      const tickets = yield* store.collection<Ticket>("tickets");

      yield* tickets.put(
        "ticket-1",
        {
          assignee: null,
          status: "open",
          tags: ["bug", "urgent"],
        },
        {
          message: "Create ticket",
        },
      );

      assert.deepStrictEqual(yield* store.list("indexes"), []);

      yield* tickets.put(
        "ticket-1",
        {
          assignee: undefined,
          author: "robert",
          status: "closed",
          tags: ["done"],
        },
        {
          message: "Update ticket",
        },
      );

      assert.deepStrictEqual(yield* tickets.get("ticket-1"), {
        author: "robert",
        status: "closed",
        tags: ["done"],
      });
      assert.deepStrictEqual(yield* store.list("indexes"), []);

      yield* tickets.put("ticket-2", {
        assignee: null,
        status: "open",
      });

      yield* tickets.delete("ticket-2");

      assert.strictEqual(yield* tickets.get("ticket-2"), null);
      assert.deepStrictEqual(yield* store.list("indexes"), []);

      yield* tickets.put("ticket-3", {
        metadata: { nested: true },
        status: "open",
      });

      assert.deepStrictEqual(yield* tickets.get("ticket-3"), {
        metadata: { nested: true },
        status: "open",
      });
      assert.deepStrictEqual(yield* store.list("indexes"), []);
    }).pipe(Effect.provide(GitDbInMemory())),
  );

  it.effect(
    "supports transaction raw paths, delete, abort, and inactive transaction failures",
    () =>
      Effect.gen(function* () {
        const store = yield* StoreApi.StoreService;
        const aborted = yield* store.begin();

        yield* aborted.put("scratch/provider.json", { enabled: true });
        assert.deepStrictEqual((yield* aborted.get("scratch/provider.json"))?.json(), {
          enabled: true,
        });
        assert.deepStrictEqual(
          (yield* aborted.list("scratch")).map((entry) => ({
            name: entry.name,
            path: entry.path,
            type: entry.type,
          })),
          [
            {
              name: "provider.json",
              path: "scratch/provider.json",
              type: "blob",
            },
          ],
        );

        yield* aborted.delete("scratch/provider.json");
        assert.strictEqual(yield* aborted.get("scratch/provider.json"), null);
        assert.deepStrictEqual(yield* aborted.list("scratch"), []);

        yield* aborted.abort();
        const abortedCommit = yield* Effect.flip(aborted.commit({ message: "Will not commit" }));

        assert.ok(abortedCommit instanceof TransactionInactiveError);

        const committed = yield* store.begin();

        yield* committed.put("scratch/provider.json", { enabled: true });
        yield* committed.commit({ message: "Commit scratch document" });

        const committedWrite = yield* Effect.flip(
          committed.put("scratch/after-commit.json", { enabled: false }),
        );

        assert.ok(committedWrite instanceof TransactionInactiveError);
        assert.deepStrictEqual((yield* store.get("scratch/provider.json"))?.json(), {
          enabled: true,
        });
      }).pipe(Effect.provide(GitDbInMemory())),
  );

  it.effect("resolves snapshots, historical reads, history filters, and path-level diffs", () =>
    Effect.gen(function* () {
      const store = yield* StoreApi.StoreService;
      const tickets = yield* store.collection<{
        readonly status: string;
        readonly title: string;
      }>("tickets");

      const created = yield* tickets.put(
        "ticket-1",
        {
          status: "open",
          title: "Safety test",
        },
        {
          message: "Create ticket",
        },
      );
      const closed = yield* tickets.put(
        "ticket-1",
        {
          status: "closed",
          title: "Safety test",
        },
        {
          message: "Close ticket",
        },
      );
      const second = yield* tickets.put(
        "ticket-2",
        {
          status: "open",
          title: "Follow-up",
        },
        {
          message: "Create second ticket",
        },
      );
      const deleted = yield* tickets.delete("ticket-1", {
        message: "Delete ticket",
      });

      assert.deepStrictEqual(yield* tickets.get("ticket-1", { from: created.id }), {
        status: "open",
        title: "Safety test",
      });
      assert.deepStrictEqual(yield* tickets.get("ticket-1", { from: closed.id }), {
        status: "closed",
        title: "Safety test",
      });
      assert.strictEqual(yield* tickets.get("ticket-1", { from: deleted.id }), null);
      assert.strictEqual(yield* store.resolveSnapshotId("main"), deleted.id);
      assert.strictEqual(yield* store.resolveSnapshotId(closed.id), closed.id);
      assert.strictEqual(yield* store.resolveSnapshotId("missing"), null);
      assert.strictEqual((yield* store.snapshot(second.id)).message, "Create second ticket");

      const missingSnapshot = yield* Effect.flip(
        store.snapshot("0000000000000000000000000000000000000000"),
      );
      const modified = yield* store.diff(created.id, closed.id);
      const added = yield* store.diff(closed.id, second.id);
      const removed = yield* store.diff(second.id, deleted.id);
      const history = yield* store.history("main");
      const limited = yield* store.history("main", { max: 2 });
      const ticketTwoHistory = yield* store.history("main", {
        path: documentStorePath("tickets", "ticket-2"),
      });

      assert.ok(missingSnapshot instanceof SnapshotNotFoundError);
      assert.deepStrictEqual(modified.added, []);
      assert.deepStrictEqual(modified.deleted, []);
      assert.deepStrictEqual(
        modified.modified.map((change) => change.path),
        [documentStorePath("tickets", "ticket-1")],
      );
      assert.deepStrictEqual(
        added.added.map((change) => change.path),
        [documentStorePath("tickets", "ticket-2")],
      );
      assert.deepStrictEqual(
        removed.deleted.map((change) => change.path),
        [documentStorePath("tickets", "ticket-1")],
      );
      assert.deepStrictEqual(
        history.map((snapshot) => snapshot.message),
        ["Delete ticket", "Create second ticket", "Close ticket", "Create ticket"],
      );
      assert.deepStrictEqual(
        limited.map((snapshot) => snapshot.message),
        ["Delete ticket", "Create second ticket"],
      );
      assert.deepStrictEqual(
        ticketTwoHistory.map((snapshot) => snapshot.message),
        ["Create second ticket"],
      );
    }).pipe(Effect.provide(GitDbInMemory())),
  );

  it.effect("moves, forks, deletes, and lists pointers with optimistic expectations", () =>
    Effect.gen(function* () {
      const store = yield* StoreApi.StoreService;
      const main = yield* store.pointer("main");

      assert.strictEqual(yield* main.current(), null);

      const providers = yield* store.collection<{ readonly enabled: boolean }>("providers");
      const initial = yield* providers.put("stripe", { enabled: true }, { message: "Add Stripe" });
      const review = yield* main.fork("review/provider-rollout");
      const reviewTx = yield* review.begin();
      const reviewProviders = yield* reviewTx.collection<{ readonly enabled: boolean }>(
        "providers",
      );

      yield* reviewProviders.put("adyen", { enabled: false });

      const reviewSnapshot = yield* reviewTx.commit({ message: "Review Adyen" });
      const release = yield* (yield* store.pointer("release/v1")).forkFrom(initial.id);
      const duplicateRelease = yield* Effect.flip(release.forkFrom("main"));
      const missingFork = yield* Effect.flip((yield* store.pointer("missing")).fork("child"));

      assert.strictEqual((yield* main.current())?.id, initial.id);
      assert.strictEqual((yield* review.current())?.id, reviewSnapshot.id);
      assert.deepStrictEqual(yield* providers.get("adyen"), null);
      assert.deepStrictEqual(yield* providers.get("adyen", { from: "review/provider-rollout" }), {
        enabled: false,
      });
      assert.ok(duplicateRelease instanceof PointerConflictError);
      assert.ok(missingFork instanceof PointerNotFoundError);
      assert.deepStrictEqual(yield* store.localPointers(), [
        "main",
        "release/v1",
        "review/provider-rollout",
      ]);
      assert.strictEqual(yield* store.pointerRef("main"), "refs/gitdb/default/main");
      assert.strictEqual(
        yield* store.remoteRefPrefix("origin"),
        "refs/gitdb/default/remotes/origin",
      );
      assert.strictEqual(
        yield* store.remotePointerRef("origin", "main"),
        "refs/gitdb/default/remotes/origin/main",
      );

      yield* release.move(reviewSnapshot.id, { expectedSnapshot: initial.id });

      const staleMove = yield* Effect.flip(
        release.move(initial.id, { expectedSnapshot: initial.id }),
      );

      assert.ok(staleMove instanceof PointerConflictError);
      assert.strictEqual(staleMove.expected, initial.id);
      assert.strictEqual(staleMove.actual, reviewSnapshot.id);

      const badMove = yield* Effect.flip(release.move("0000000000000000000000000000000000000000"));

      assert.ok(badMove instanceof SnapshotNotFoundError);

      yield* release.delete({ expectedSnapshot: reviewSnapshot.id });

      assert.strictEqual(yield* release.current(), null);
      assert.deepStrictEqual(yield* store.localPointers(), ["main", "review/provider-rollout"]);
    }).pipe(Effect.provide(GitDbInMemory())),
  );

  it.effect("exposes typed validation failures and invalid JSON failures", () =>
    Effect.gen(function* () {
      const store = yield* StoreApi.StoreService;
      const providers = yield* store.collection("providers");
      const invalidCollection = yield* Effect.flip(store.collection("bad/name"));
      const invalidPointer = yield* Effect.flip(store.pointer("refs/heads/main"));
      const invalidPath = yield* Effect.flip(store.get("../secret"));
      const invalidDocumentId = yield* Effect.flip(providers.put("bad/id", {}));
      const invalidRemote = yield* Effect.flip(store.sync({ remote: "../origin" }));
      const tx = yield* store.begin();

      yield* tx.put(documentStorePath("providers", "stripe"), "not-json");
      yield* tx.commit({ message: "Write invalid JSON" });

      const invalidJson = yield* Effect.flip(providers.get("stripe"));
      const invalidNamespace = yield* Effect.gen(function* () {
        yield* StoreApi.StoreService;
      }).pipe(Effect.provide(GitDbInMemory({ namespace: "refs/heads/main" })), Effect.flip);

      assert.ok(invalidCollection instanceof InvalidIdentifierError);
      assert.ok(invalidPointer instanceof InvalidPointerNameError);
      assert.ok(invalidPath instanceof InvalidPathError);
      assert.ok(invalidDocumentId instanceof InvalidIdentifierError);
      assert.ok(invalidRemote instanceof InvalidIdentifierError);
      assert.ok(invalidJson instanceof InvalidJsonDocumentError);
      assert.ok(invalidNamespace instanceof InvalidNamespaceError);
    }).pipe(Effect.provide(GitDbInMemory())),
  );

  it.effect("allows email-style document ids while rejecting path-like ids", () =>
    Effect.gen(function* () {
      const store = yield* StoreApi.StoreService;
      const users = yield* store.collection<{
        readonly displayName: string;
        readonly email: string;
      }>("users");
      const userId = "robert.pitt+cycle@example.com";

      yield* users.put(userId, {
        displayName: "Robert Pitt",
        email: userId,
      });

      const fetched = yield* users.get(userId);
      const invalidPathId = yield* Effect.flip(
        users.put("robert.pitt+cycle/example.com", {
          displayName: "Invalid User",
          email: "invalid@example.com",
        }),
      );

      assert.deepStrictEqual(fetched, {
        displayName: "Robert Pitt",
        email: userId,
      });
      assert.ok(invalidPathId instanceof InvalidIdentifierError);
    }).pipe(Effect.provide(GitDbInMemory())),
  );

  it.effect(
    "supports the module-first helper APIs for transactions, pointers, snapshots, and sync",
    () =>
      Effect.gen(function* () {
        const store = yield* StoreApi.StoreService;
        const tx = yield* TransactionApi.begin(store);
        const txProviders = yield* tx.collection<{ readonly enabled: boolean }>("providers");

        yield* txProviders.put("stripe", { enabled: true });

        const snapshot = yield* TransactionApi.commit(tx, {
          message: "Commit through transaction helper",
        });
        const providers = yield* CollectionApi.get<{ readonly enabled: boolean }>(
          store,
          "providers",
        );
        const collectionList = yield* CollectionApi.list(store);
        const entries = yield* CollectionApi.entries(providers);
        const pointer = yield* PointerApi.get(store, "main");
        const localNames = yield* PointerApi.localNames(store);
        const resolved = yield* SnapshotApi.resolveId(store, "main");
        const history = yield* SnapshotApi.history(store, "main");
        const diff = yield* SnapshotApi.diff(store, snapshot.id, snapshot.id);
        const sync = yield* SyncApi.run(store, {
          mode: "fetch",
          pointers: ["main"],
          remote: "origin",
        });

        yield* PointerApi.move(pointer, snapshot.id, { expectedSnapshot: snapshot.id });

        const pointerTx = yield* PointerApi.begin(pointer);

        yield* TransactionApi.abort(pointerTx);

        const inactiveCommit = yield* Effect.flip(TransactionApi.commit(pointerTx));

        assert.deepStrictEqual(collectionList, [
          {
            meta: undefined,
            name: "providers",
            path: "collections/providers",
          },
        ]);
        assert.deepStrictEqual(
          entries.map((entry) => entry.id),
          ["stripe"],
        );
        assert.deepStrictEqual(yield* providers.get("stripe"), { enabled: true });
        assert.strictEqual((yield* PointerApi.current(pointer))?.id, snapshot.id);
        assert.deepStrictEqual(localNames, ["main"]);
        assert.strictEqual(resolved, snapshot.id);
        assert.deepStrictEqual(
          history.map((item) => item.id),
          [snapshot.id],
        );
        assert.deepStrictEqual(diff, {
          added: [],
          deleted: [],
          modified: [],
        });
        assert.deepStrictEqual(sync, {
          pointers: [
            {
              localAfter: snapshot.id,
              localBefore: snapshot.id,
              pointer: "main",
              remoteAfter: undefined,
              remoteBefore: undefined,
              status: "up-to-date",
            },
          ],
          remote: "origin",
        });
        assert.ok(inactiveCommit instanceof TransactionInactiveError);
      }).pipe(Effect.provide(GitDbInMemory())),
  );

  it.effect("detects optimistic pointer conflicts", () =>
    Effect.gen(function* () {
      const store = yield* StoreApi.StoreService;
      const first = yield* store.begin();
      const second = yield* store.begin();
      const firstProviders = yield* first.collection("providers");
      const secondProviders = yield* second.collection("providers");

      yield* firstProviders.put("stripe", { enabled: true });
      yield* secondProviders.put("adyen", { enabled: true });
      yield* first.commit({ message: "Add Stripe" });

      const error = yield* Effect.flip(second.commit({ message: "Add Adyen" }));

      assert.ok(error instanceof PointerConflictError);
      assert.strictEqual(error.pointer, "main");
      assert.strictEqual(error.expected, null);
      assert.ok(error.actual !== null);
    }).pipe(Effect.provide(GitDbInMemory())),
  );

  it.effect("supports module-first collection, pointer, and snapshot helpers", () =>
    Effect.gen(function* () {
      const store = yield* StoreApi.StoreService;
      const providers = yield* CollectionApi.get<{ readonly enabled: boolean }>(store, "providers");
      const snapshot = yield* CollectionApi.put(
        providers,
        "stripe",
        {
          enabled: true,
        },
        {
          message: "Add provider through module API",
        },
      );
      const pointer = yield* PointerApi.get(store, "main");

      assert.strictEqual((yield* SnapshotApi.get(store, snapshot.id)).id, snapshot.id);
      assert.strictEqual((yield* PointerApi.current(pointer))?.id, snapshot.id);
      assert.deepStrictEqual(yield* providers.get("stripe"), {
        enabled: true,
      });
    }).pipe(Effect.provide(GitDbInMemory())),
  );

  it.effect("rolls back staged mutations when an Effect transaction fails", () =>
    Effect.gen(function* () {
      const store = yield* StoreApi.StoreService;
      const tx = yield* store.begin();
      const providers = yield* tx.collection<{ readonly enabled: boolean }>("providers");
      const failure = yield* Effect.tx(
        Effect.gen(function* () {
          yield* providers.put("stripe", { enabled: true });

          return yield* Effect.fail("rollback");
        }),
      ).pipe(Effect.flip);

      assert.strictEqual(failure, "rollback");
      assert.strictEqual(yield* providers.get("stripe"), null);

      yield* providers.put("stripe", { enabled: true });
      yield* tx.commit({ message: "Add provider" });

      const collection = yield* store.collection<{ readonly enabled: boolean }>("providers");

      assert.deepStrictEqual(yield* collection.get("stripe"), { enabled: true });
    }).pipe(Effect.provide(GitDbInMemory())),
  );

  it.effect("uses Git objects and refs without mutating normal Git workflow state", () =>
    withRepo((repo) =>
      Effect.gen(function* () {
        const gitDir = path.join(repo, ".git");
        const beforeHead = (yield* git(repo, ["rev-parse", "HEAD"])).trim();
        const beforeBranch = (yield* git(repo, [
          "show-ref",
          "--verify",
          "--hash",
          "refs/heads/main",
        ])).trim();
        const beforeIndex = yield* hashFile(path.join(gitDir, "index"));
        const beforeSource = yield* attemptPromise(() =>
          readFile(path.join(repo, "source.txt"), "utf8"),
        );
        const result = yield* Effect.gen(function* () {
          const store = yield* StoreApi.StoreService;
          const tickets = yield* store.collection<{
            readonly status: string;
            readonly title: string;
          }>("tickets");
          const first = yield* tickets.put(
            "ticket-1",
            {
              status: "open",
              title: "Safety test",
            },
            {
              message: "Create ticket",
            },
          );
          const second = yield* tickets.put(
            "ticket-1",
            {
              status: "closed",
              title: "Safety test",
            },
            {
              message: "Close ticket",
            },
          );

          return { first, second, store, tickets };
        }).pipe(Effect.provide(GitDbLive({ gitDir })));

        const appRef = (yield* git(repo, [
          "show-ref",
          "--verify",
          "--hash",
          "refs/gitdb/default/main",
        ])).trim();
        const status = (yield* git(repo, ["status", "--short"])).trim();
        const afterHead = (yield* git(repo, ["rev-parse", "HEAD"])).trim();
        const afterBranch = (yield* git(repo, [
          "show-ref",
          "--verify",
          "--hash",
          "refs/heads/main",
        ])).trim();
        const afterIndex = yield* hashFile(path.join(gitDir, "index"));
        const afterSource = yield* attemptPromise(() =>
          readFile(path.join(repo, "source.txt"), "utf8"),
        );
        const firstValue = yield* result.tickets.get("ticket-1", { from: result.first.id });
        const secondValue = yield* result.tickets.get("ticket-1", { from: result.second.id });
        const diff = yield* result.store.diff(result.first.id, result.second.id);
        const history = yield* result.store.history("main");

        assert.strictEqual(appRef, result.second.id);
        assert.strictEqual(status, "");
        assert.strictEqual(afterHead, beforeHead);
        assert.strictEqual(afterBranch, beforeBranch);
        assert.strictEqual(afterIndex, beforeIndex);
        assert.strictEqual(afterSource, beforeSource);
        assert.deepStrictEqual(firstValue, {
          status: "open",
          title: "Safety test",
        });
        assert.deepStrictEqual(secondValue, {
          status: "closed",
          title: "Safety test",
        });
        assert.strictEqual(diff.modified.length, 1);
        assert.match(
          diff.modified[0]?.path ?? "",
          /^collections\/tickets\/[0-9a-f]{2}\/ticket-1\.json$/u,
        );
        assert.deepStrictEqual(
          history.map((snapshot) => snapshot.message),
          ["Close ticket", "Create ticket"],
        );
      }),
    ),
  );

  it.effect("writes valid Git objects through the direct filesystem backend", () =>
    withRepo((repo) =>
      Effect.gen(function* () {
        const gitDir = path.join(repo, ".git");
        const written = yield* Effect.gen(function* () {
          const store = yield* StoreApi.StoreService;
          const tickets = yield* store.collection<{
            readonly status: string;
            readonly title: string;
          }>("tickets");
          const snapshot = yield* tickets.put(
            "ticket-1",
            {
              status: "open",
              title: "Filesystem backend",
            },
            {
              message: "Create filesystem ticket",
            },
          );
          const value = yield* tickets.get("ticket-1");

          return { snapshot, value };
        }).pipe(Effect.provide(GitDbFilesystem({ gitDir })));
        const appRef = (yield* git(repo, [
          "show-ref",
          "--verify",
          "--hash",
          "refs/gitdb/default/main",
        ])).trim();
        const commit = yield* git(repo, ["cat-file", "-p", written.snapshot.id]);
        const cliRead = yield* Effect.gen(function* () {
          const store = yield* StoreApi.StoreService;
          const tickets = yield* store.collection<{
            readonly status: string;
            readonly title: string;
          }>("tickets");

          return yield* tickets.get("ticket-1");
        }).pipe(Effect.provide(GitDbLive({ gitDir })));

        assert.strictEqual(appRef, written.snapshot.id);
        assert.match(commit, /^tree [0-9a-f]{40}$/mu);
        assert.deepStrictEqual(written.value, {
          status: "open",
          title: "Filesystem backend",
        });
        assert.deepStrictEqual(cliRead, written.value);

        const cliWritten = yield* Effect.gen(function* () {
          const store = yield* StoreApi.StoreService;
          const tickets = yield* store.collection<{
            readonly status: string;
            readonly title: string;
          }>("tickets");

          return yield* tickets.put(
            "ticket-2",
            {
              status: "closed",
              title: "CLI backend",
            },
            {
              message: "Create CLI ticket",
            },
          );
        }).pipe(Effect.provide(GitDbLive({ gitDir })));
        yield* git(repo, ["gc"]);
        const packedAppRef = (yield* git(repo, [
          "show-ref",
          "--verify",
          "--hash",
          "refs/gitdb/default/main",
        ])).trim();
        const filesystemRead = yield* Effect.gen(function* () {
          const store = yield* StoreApi.StoreService;
          const tickets = yield* store.collection<{
            readonly status: string;
            readonly title: string;
          }>("tickets");

          return yield* tickets.get("ticket-2");
        }).pipe(Effect.provide(GitDbFilesystem({ gitDir })));

        assert.strictEqual(packedAppRef, cliWritten.id);
        assert.deepStrictEqual(filesystemRead, {
          status: "closed",
          title: "CLI backend",
        });
      }),
    ),
  );

  it.effect("syncs GitDB refs with push, fetch, and fast-forward statuses", () =>
    withRepo((repo) =>
      withTempDir("git-db-remote-", (remoteRoot) =>
        withTempDir("git-db-clone-", (cloneRoot) =>
          Effect.gen(function* () {
            const remote = path.join(remoteRoot, "origin.git");
            const clone = path.join(cloneRoot, "work");

            yield* git(repo, ["clone", "--bare", repo, remote]);
            yield* git(repo, ["remote", "add", "origin", remote]);

            const base = yield* Effect.gen(function* () {
              const store = yield* StoreApi.StoreService;
              const tickets = yield* store.collection<{
                readonly status: string;
                readonly title: string;
              }>("tickets");
              const snapshot = yield* tickets.put(
                "ticket-1",
                {
                  status: "open",
                  title: "Sync status test",
                },
                {
                  message: "Create sync ticket",
                },
              );
              const sync = yield* store.sync({
                mode: "push",
                pointers: ["main"],
                remote: "origin",
              });

              return { snapshot, sync };
            }).pipe(Effect.provide(GitDbLive({ gitDir: path.join(repo, ".git") })));

            yield* git(repo, ["clone", remote, clone]);

            const clonedPull = yield* Effect.gen(function* () {
              const store = yield* StoreApi.StoreService;
              const tickets = yield* store.collection<{
                readonly status: string;
                readonly title: string;
              }>("tickets");
              const sync = yield* store.sync({
                mode: "full",
                pointers: ["main"],
                remote: "origin",
              });
              const value = yield* tickets.get("ticket-1");

              return { sync, value };
            }).pipe(Effect.provide(GitDbLive({ gitDir: path.join(clone, ".git") })));

            const clonedFetch = yield* Effect.gen(function* () {
              const store = yield* StoreApi.StoreService;

              return yield* store.sync({
                mode: "fetch",
                pointers: ["main"],
                remote: "origin",
              });
            }).pipe(Effect.provide(GitDbLive({ gitDir: path.join(clone, ".git") })));

            const clonedUpdate = yield* Effect.gen(function* () {
              const store = yield* StoreApi.StoreService;
              const tickets = yield* store.collection<{
                readonly status: string;
                readonly title: string;
              }>("tickets");
              const snapshot = yield* tickets.put(
                "ticket-1",
                {
                  status: "closed",
                  title: "Sync status test",
                },
                {
                  message: "Close sync ticket",
                },
              );
              const sync = yield* store.sync({
                mode: "push",
                pointers: ["main"],
                remote: "origin",
              });

              return { snapshot, sync };
            }).pipe(Effect.provide(GitDbLive({ gitDir: path.join(clone, ".git") })));

            const localBehindPush = yield* Effect.gen(function* () {
              const store = yield* StoreApi.StoreService;
              const tickets = yield* store.collection<{
                readonly status: string;
                readonly title: string;
              }>("tickets");
              yield* store.sync({
                mode: "fetch",
                pointers: ["main"],
                remote: "origin",
              });
              const sync = yield* store.sync({
                mode: "push",
                pointers: ["main"],
                remote: "origin",
              });
              const value = yield* tickets.get("ticket-1");

              return { sync, value };
            }).pipe(Effect.provide(GitDbLive({ gitDir: path.join(repo, ".git") })));

            const localPull = yield* Effect.gen(function* () {
              const store = yield* StoreApi.StoreService;
              const tickets = yield* store.collection<{
                readonly status: string;
                readonly title: string;
              }>("tickets");
              const sync = yield* store.sync({
                mode: "full",
                pointers: ["main"],
                remote: "origin",
              });
              const value = yield* tickets.get("ticket-1");

              return { sync, value };
            }).pipe(Effect.provide(GitDbLive({ gitDir: path.join(repo, ".git") })));

            const localAheadPull = yield* Effect.gen(function* () {
              const store = yield* StoreApi.StoreService;
              const tickets = yield* store.collection<{
                readonly status: string;
                readonly title: string;
              }>("tickets");
              const snapshot = yield* tickets.put(
                "ticket-1",
                {
                  status: "verified",
                  title: "Sync status test",
                },
                {
                  message: "Verify sync ticket locally",
                },
              );
              const sync = yield* store.sync({
                mode: "pull",
                pointers: ["main"],
                remote: "origin",
              });
              const value = yield* tickets.get("ticket-1");

              return { snapshot, sync, value };
            }).pipe(Effect.provide(GitDbLive({ gitDir: path.join(repo, ".git") })));

            assert.strictEqual(base.sync.pointers[0]?.status, "pushed");
            assert.strictEqual(base.sync.pointers[0]?.localBefore, base.snapshot.id);
            assert.strictEqual(base.sync.pointers[0]?.remoteBefore, undefined);
            assert.strictEqual(clonedPull.sync.pointers[0]?.status, "fast-forwarded");
            assert.strictEqual(clonedPull.sync.pointers[0]?.remoteBefore, base.snapshot.id);
            assert.deepStrictEqual(clonedPull.value, {
              status: "open",
              title: "Sync status test",
            });
            assert.strictEqual(clonedFetch.pointers[0]?.status, "up-to-date");
            assert.strictEqual(clonedFetch.pointers[0]?.localBefore, base.snapshot.id);
            assert.strictEqual(clonedFetch.pointers[0]?.remoteBefore, base.snapshot.id);
            assert.strictEqual(clonedUpdate.sync.pointers[0]?.status, "pushed");
            assert.strictEqual(
              clonedUpdate.sync.pointers[0]?.localBefore,
              clonedUpdate.snapshot.id,
            );
            assert.strictEqual(localBehindPush.sync.pointers[0]?.status, "rejected");
            assert.strictEqual(localBehindPush.sync.pointers[0]?.localBefore, base.snapshot.id);
            assert.strictEqual(
              localBehindPush.sync.pointers[0]?.remoteBefore,
              clonedUpdate.snapshot.id,
            );
            assert.deepStrictEqual(localBehindPush.value, {
              status: "open",
              title: "Sync status test",
            });
            assert.strictEqual(localPull.sync.pointers[0]?.status, "fast-forwarded");
            assert.strictEqual(localPull.sync.pointers[0]?.localAfter, clonedUpdate.snapshot.id);
            assert.deepStrictEqual(localPull.value, {
              status: "closed",
              title: "Sync status test",
            });
            assert.strictEqual(localAheadPull.sync.pointers[0]?.status, "up-to-date");
            assert.strictEqual(
              localAheadPull.sync.pointers[0]?.localBefore,
              localAheadPull.snapshot.id,
            );
            assert.strictEqual(
              localAheadPull.sync.pointers[0]?.remoteBefore,
              clonedUpdate.snapshot.id,
            );
            assert.strictEqual(
              localAheadPull.sync.pointers[0]?.localAfter,
              localAheadPull.snapshot.id,
            );
            assert.deepStrictEqual(localAheadPull.value, {
              status: "verified",
              title: "Sync status test",
            });
          }),
        ),
      ),
    ),
  );

  it.effect("reports sync conflicts without overwriting diverged GitDB refs", () =>
    withRepo((repo) =>
      withTempDir("git-db-remote-", (remoteRoot) =>
        withTempDir("git-db-clone-", (cloneRoot) =>
          Effect.gen(function* () {
            const remote = path.join(remoteRoot, "origin.git");
            const clone = path.join(cloneRoot, "work");

            yield* git(repo, ["clone", "--bare", repo, remote]);
            yield* git(repo, ["remote", "add", "origin", remote]);

            const base = yield* Effect.gen(function* () {
              const store = yield* StoreApi.StoreService;
              const tickets = yield* store.collection<{
                readonly assignee: string | null;
                readonly status: string;
                readonly title: string;
              }>("tickets");
              const snapshot = yield* tickets.put(
                "ticket-1",
                {
                  assignee: null,
                  status: "open",
                  title: "Remote conflict test",
                },
                {
                  message: "Create ticket",
                },
              );

              yield* store.sync({
                mode: "push",
                pointers: ["main"],
                remote: "origin",
              });

              return snapshot;
            }).pipe(Effect.provide(GitDbLive({ gitDir: path.join(repo, ".git") })));

            yield* git(repo, ["clone", remote, clone]);

            yield* Effect.gen(function* () {
              const store = yield* StoreApi.StoreService;

              yield* store.sync({
                mode: "full",
                pointers: ["main"],
                remote: "origin",
              });
            }).pipe(Effect.provide(GitDbLive({ gitDir: path.join(clone, ".git") })));

            const localSnapshot = yield* Effect.gen(function* () {
              const store = yield* StoreApi.StoreService;
              const tickets = yield* store.collection<{
                readonly assignee: string | null;
                readonly status: string;
                readonly title: string;
              }>("tickets");
              const snapshot = yield* tickets.put(
                "ticket-1",
                {
                  assignee: "alice",
                  status: "in-progress",
                  title: "Remote conflict test",
                },
                {
                  message: "Assign ticket to Alice",
                },
              );

              yield* store.sync({
                mode: "push",
                pointers: ["main"],
                remote: "origin",
              });

              return snapshot;
            }).pipe(Effect.provide(GitDbLive({ gitDir: path.join(repo, ".git") })));

            const clonedResult = yield* Effect.gen(function* () {
              const store = yield* StoreApi.StoreService;
              const tickets = yield* store.collection<{
                readonly assignee: string | null;
                readonly status: string;
                readonly title: string;
              }>("tickets");
              const clonedSnapshot = yield* tickets.put(
                "ticket-1",
                {
                  assignee: "bob",
                  status: "closed",
                  title: "Remote conflict test",
                },
                {
                  message: "Close ticket as Bob",
                },
              );
              const conflict = yield* Effect.flip(
                store.sync({
                  mode: "full",
                  pointers: ["main"],
                  remote: "origin",
                }),
              );
              const cloneValue = yield* tickets.get("ticket-1");
              const remoteSnapshot = (yield* git(clone, [
                "show-ref",
                "--verify",
                "--hash",
                "refs/gitdb/default/remotes/origin/main",
              ])).trim();

              return {
                cloneValue,
                clonedSnapshot,
                conflict,
                remoteSnapshot,
              };
            }).pipe(Effect.provide(GitDbLive({ gitDir: path.join(clone, ".git") })));

            assert.ok(clonedResult.conflict instanceof SyncConflictError);
            assert.strictEqual(clonedResult.conflict.pointer, "main");
            assert.strictEqual(clonedResult.conflict.localSnapshot, clonedResult.clonedSnapshot.id);
            assert.strictEqual(clonedResult.conflict.remoteSnapshot, localSnapshot.id);
            assert.strictEqual(clonedResult.conflict.mergeBase, base.id);
            assert.deepStrictEqual(clonedResult.cloneValue, {
              assignee: "bob",
              status: "closed",
              title: "Remote conflict test",
            });
            assert.strictEqual(clonedResult.remoteSnapshot, localSnapshot.id);

            const keepRemote = yield* Effect.gen(function* () {
              const store = yield* StoreApi.StoreService;
              const tickets = yield* store.collection<{
                readonly assignee: string | null;
                readonly status: string;
                readonly title: string;
              }>("tickets");
              const sync = yield* store.sync({
                mode: "full",
                onDiverged: "keep-remote",
                pointers: ["main"],
                remote: "origin",
              });
              const value = yield* tickets.get("ticket-1");

              return { sync, value };
            }).pipe(Effect.provide(GitDbLive({ gitDir: path.join(clone, ".git") })));

            assert.strictEqual(keepRemote.sync.pointers[0]?.status, "fast-forwarded");
            assert.strictEqual(keepRemote.sync.pointers[0]?.localAfter, localSnapshot.id);
            assert.deepStrictEqual(keepRemote.value, {
              assignee: "alice",
              status: "in-progress",
              title: "Remote conflict test",
            });

            const remoteWins = yield* Effect.gen(function* () {
              const store = yield* StoreApi.StoreService;
              const tickets = yield* store.collection<{
                readonly assignee: string | null;
                readonly status: string;
                readonly title: string;
              }>("tickets");
              const snapshot = yield* tickets.put(
                "ticket-1",
                {
                  assignee: "alice",
                  status: "verified",
                  title: "Remote conflict test",
                },
                {
                  message: "Verify ticket as Alice",
                },
              );

              yield* store.sync({
                mode: "push",
                pointers: ["main"],
                remote: "origin",
              });

              return snapshot;
            }).pipe(Effect.provide(GitDbLive({ gitDir: path.join(repo, ".git") })));

            const localWins = yield* Effect.gen(function* () {
              const store = yield* StoreApi.StoreService;
              const tickets = yield* store.collection<{
                readonly assignee: string | null;
                readonly status: string;
                readonly title: string;
              }>("tickets");
              const snapshot = yield* tickets.put(
                "ticket-1",
                {
                  assignee: "bob",
                  status: "review",
                  title: "Remote conflict test",
                },
                {
                  message: "Review ticket as Bob",
                },
              );
              const sync = yield* store.sync({
                mode: "full",
                onDiverged: "keep-local",
                pointers: ["main"],
                remote: "origin",
              });
              const value = yield* tickets.get("ticket-1");

              return { snapshot, sync, value };
            }).pipe(Effect.provide(GitDbLive({ gitDir: path.join(clone, ".git") })));
            const remoteRefAfterKeepLocal = (yield* git(remote, [
              "show-ref",
              "--verify",
              "--hash",
              "refs/gitdb/default/main",
            ])).trim();

            assert.notStrictEqual(localWins.snapshot.id, remoteWins.id);
            assert.strictEqual(localWins.sync.pointers[0]?.status, "pushed");
            assert.strictEqual(localWins.sync.pointers[0]?.remoteBefore, remoteWins.id);
            assert.strictEqual(localWins.sync.pointers[0]?.remoteAfter, localWins.snapshot.id);
            assert.deepStrictEqual(localWins.value, {
              assignee: "bob",
              status: "review",
              title: "Remote conflict test",
            });
            assert.strictEqual(remoteRefAfterKeepLocal, localWins.snapshot.id);
          }),
        ),
      ),
    ),
  );

  it.effect("auto-merges diverged GitDB refs with disjoint path changes", () =>
    withRepo((repo) =>
      withTempDir("git-db-remote-", (remoteRoot) =>
        withTempDir("git-db-clone-", (cloneRoot) =>
          Effect.gen(function* () {
            const remote = path.join(remoteRoot, "origin.git");
            const clone = path.join(cloneRoot, "work");

            yield* git(repo, ["clone", "--bare", repo, remote]);
            yield* git(repo, ["remote", "add", "origin", remote]);

            yield* Effect.gen(function* () {
              const store = yield* StoreApi.StoreService;
              const tickets = yield* store.collection<{
                readonly status: string;
                readonly title: string;
              }>("tickets");
              const snapshot = yield* tickets.put(
                "ticket-1",
                {
                  status: "open",
                  title: "Merge base ticket",
                },
                {
                  message: "Create merge base ticket",
                },
              );

              yield* store.sync({
                mode: "push",
                pointers: ["main"],
                remote: "origin",
              });

              return snapshot;
            }).pipe(Effect.provide(GitDbLive({ gitDir: path.join(repo, ".git") })));

            yield* git(repo, ["clone", remote, clone]);

            yield* Effect.gen(function* () {
              const store = yield* StoreApi.StoreService;

              yield* store.sync({
                mode: "full",
                pointers: ["main"],
                remote: "origin",
              });
            }).pipe(Effect.provide(GitDbLive({ gitDir: path.join(clone, ".git") })));

            const remoteSnapshot = yield* Effect.gen(function* () {
              const store = yield* StoreApi.StoreService;
              const tickets = yield* store.collection<{
                readonly status: string;
                readonly title: string;
              }>("tickets");
              const snapshot = yield* tickets.put(
                "ticket-1",
                {
                  status: "closed",
                  title: "Merge base ticket",
                },
                {
                  message: "Close ticket remotely",
                },
              );

              yield* store.sync({
                mode: "push",
                pointers: ["main"],
                remote: "origin",
              });

              return snapshot;
            }).pipe(Effect.provide(GitDbLive({ gitDir: path.join(repo, ".git") })));

            const sourcePath = path.join(clone, "source.txt");
            yield* attemptPromise(() => writeFile(sourcePath, "local worktree edit\n"));
            const branchBefore = (yield* git(clone, ["symbolic-ref", "--short", "HEAD"])).trim();
            const headBefore = (yield* git(clone, ["rev-parse", "HEAD"])).trim();
            const worktreeHashBefore = yield* hashFile(sourcePath);

            const merged = yield* Effect.gen(function* () {
              const store = yield* StoreApi.StoreService;
              const tickets = yield* store.collection<{
                readonly status: string;
                readonly title: string;
              }>("tickets");
              const clonedSnapshot = yield* tickets.put(
                "ticket-2",
                {
                  status: "open",
                  title: "Local airplane ticket",
                },
                {
                  message: "Create local airplane ticket",
                },
              );
              const sync = yield* store.sync({
                mode: "full",
                onDiverged: "merge",
                pointers: ["main"],
                remote: "origin",
              });
              const ticketOne = yield* tickets.get("ticket-1");
              const ticketTwo = yield* tickets.get("ticket-2");
              const snapshot = yield* store.snapshot(sync.pointers[0]?.localAfter ?? "");

              return {
                clonedSnapshot,
                snapshot,
                sync,
                ticketOne,
                ticketTwo,
              };
            }).pipe(Effect.provide(GitDbLive({ gitDir: path.join(clone, ".git") })));

            const remoteRefAfterMerge = (yield* git(remote, [
              "show-ref",
              "--verify",
              "--hash",
              "refs/gitdb/default/main",
            ])).trim();
            yield* git(clone, ["fsck", "--strict", remoteRefAfterMerge]);
            const branchAfter = (yield* git(clone, ["symbolic-ref", "--short", "HEAD"])).trim();
            const headAfter = (yield* git(clone, ["rev-parse", "HEAD"])).trim();
            const worktreeHashAfter = yield* hashFile(sourcePath);

            assert.strictEqual(merged.sync.pointers[0]?.status, "merged");
            assert.strictEqual(merged.sync.pointers[0]?.localBefore, merged.clonedSnapshot.id);
            assert.strictEqual(merged.sync.pointers[0]?.remoteBefore, remoteSnapshot.id);
            assert.strictEqual(merged.sync.pointers[0]?.localAfter, remoteRefAfterMerge);
            assert.strictEqual(merged.sync.pointers[0]?.remoteAfter, remoteRefAfterMerge);
            assert.deepStrictEqual(merged.snapshot.parents, [
              remoteSnapshot.id,
              merged.clonedSnapshot.id,
            ]);
            assert.deepStrictEqual(merged.ticketOne, {
              status: "closed",
              title: "Merge base ticket",
            });
            assert.deepStrictEqual(merged.ticketTwo, {
              status: "open",
              title: "Local airplane ticket",
            });
            assert.strictEqual(branchAfter, branchBefore);
            assert.strictEqual(headAfter, headBefore);
            assert.strictEqual(worktreeHashAfter, worktreeHashBefore);
          }),
        ),
      ),
    ),
  );

  it.effect("keeps diverged same-path GitDB conflicts explicit when merging", () =>
    withRepo((repo) =>
      withTempDir("git-db-remote-", (remoteRoot) =>
        withTempDir("git-db-clone-", (cloneRoot) =>
          Effect.gen(function* () {
            const remote = path.join(remoteRoot, "origin.git");
            const clone = path.join(cloneRoot, "work");

            yield* git(repo, ["clone", "--bare", repo, remote]);
            yield* git(repo, ["remote", "add", "origin", remote]);

            const base = yield* Effect.gen(function* () {
              const store = yield* StoreApi.StoreService;
              const tickets = yield* store.collection<{
                readonly assignee: string | null;
                readonly status: string;
                readonly title: string;
              }>("tickets");
              const snapshot = yield* tickets.put(
                "ticket-1",
                {
                  assignee: null,
                  status: "open",
                  title: "Explicit merge conflict",
                },
                {
                  message: "Create conflict base ticket",
                },
              );

              yield* store.sync({
                mode: "push",
                pointers: ["main"],
                remote: "origin",
              });

              return snapshot;
            }).pipe(Effect.provide(GitDbLive({ gitDir: path.join(repo, ".git") })));

            yield* git(repo, ["clone", remote, clone]);

            yield* Effect.gen(function* () {
              const store = yield* StoreApi.StoreService;

              yield* store.sync({
                mode: "full",
                pointers: ["main"],
                remote: "origin",
              });
            }).pipe(Effect.provide(GitDbLive({ gitDir: path.join(clone, ".git") })));

            const remoteSnapshot = yield* Effect.gen(function* () {
              const store = yield* StoreApi.StoreService;
              const tickets = yield* store.collection<{
                readonly assignee: string | null;
                readonly status: string;
                readonly title: string;
              }>("tickets");
              const snapshot = yield* tickets.put(
                "ticket-1",
                {
                  assignee: "alice",
                  status: "in-progress",
                  title: "Explicit merge conflict",
                },
                {
                  message: "Assign ticket remotely",
                },
              );

              yield* store.sync({
                mode: "push",
                pointers: ["main"],
                remote: "origin",
              });

              return snapshot;
            }).pipe(Effect.provide(GitDbLive({ gitDir: path.join(repo, ".git") })));

            const result = yield* Effect.gen(function* () {
              const store = yield* StoreApi.StoreService;
              const tickets = yield* store.collection<{
                readonly assignee: string | null;
                readonly status: string;
                readonly title: string;
              }>("tickets");
              const clonedSnapshot = yield* tickets.put(
                "ticket-1",
                {
                  assignee: "bob",
                  status: "closed",
                  title: "Explicit merge conflict",
                },
                {
                  message: "Close ticket locally",
                },
              );
              const conflict = yield* Effect.flip(
                store.sync({
                  mode: "full",
                  onDiverged: "merge",
                  pointers: ["main"],
                  remote: "origin",
                }),
              );
              const localRef = yield* store.resolveSnapshotId("main");

              return {
                clonedSnapshot,
                conflict,
                localRef,
              };
            }).pipe(Effect.provide(GitDbLive({ gitDir: path.join(clone, ".git") })));

            const remoteRefAfterConflict = (yield* git(remote, [
              "show-ref",
              "--verify",
              "--hash",
              "refs/gitdb/default/main",
            ])).trim();

            assert.ok(result.conflict instanceof SyncConflictError);
            assert.strictEqual(result.conflict.localSnapshot, result.clonedSnapshot.id);
            assert.strictEqual(result.conflict.remoteSnapshot, remoteSnapshot.id);
            assert.strictEqual(result.conflict.mergeBase, base.id);
            assert.strictEqual(result.localRef, result.clonedSnapshot.id);
            assert.strictEqual(remoteRefAfterConflict, remoteSnapshot.id);
          }),
        ),
      ),
    ),
  );
});
