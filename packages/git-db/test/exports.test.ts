import {
  Document as RootDocument,
  Event,
  GitDbFilesystem,
  Pointer,
  Schemas,
  Snapshot,
  Store,
  Sync,
  Transaction,
} from "@cycle/git-db";
import { Document } from "@cycle/git-db/document";
import { InvalidPathError, type GitDbError } from "@cycle/git-db/errors";
import { path as eventPath } from "@cycle/git-db/event";
import { GitDbInMemory } from "@cycle/git-db/live";
import { current as pointerCurrent } from "@cycle/git-db/pointer";
import { SyncResult } from "@cycle/git-db/schemas";
import { get as snapshotGet } from "@cycle/git-db/snapshot";
import { StoreService, type StoreServiceShape } from "@cycle/git-db/store";
import { run as syncRun } from "@cycle/git-db/sync";
import { begin as transactionBegin } from "@cycle/git-db/transaction";
import { assert, describe, it } from "./effect-vitest.ts";

describe("@cycle/git-db exports", () => {
  it("exposes every declared public subpath", () => {
    const maybeError: GitDbError | undefined = undefined;
    const maybeStore: StoreServiceShape | undefined = undefined;

    assert.strictEqual(maybeError, undefined);
    assert.strictEqual(maybeStore, undefined);
    assert.strictEqual(typeof RootDocument.Document, "function");
    assert.strictEqual(typeof Document, "function");
    assert.strictEqual(typeof Event.append, "function");
    assert.strictEqual(typeof eventPath, "function");
    assert.strictEqual(typeof GitDbFilesystem, "function");
    assert.strictEqual(typeof GitDbInMemory, "function");
    assert.strictEqual(typeof InvalidPathError, "function");
    assert.strictEqual(typeof Pointer.current, "function");
    assert.strictEqual(typeof pointerCurrent, "function");
    assert.strictEqual(typeof Schemas.SyncResult, "object");
    assert.strictEqual(typeof SyncResult, "object");
    assert.strictEqual(typeof Snapshot.get, "function");
    assert.strictEqual(typeof snapshotGet, "function");
    assert.strictEqual(typeof Store.StoreService, "function");
    assert.strictEqual(typeof StoreService, "function");
    assert.strictEqual(typeof Sync.run, "function");
    assert.strictEqual(typeof syncRun, "function");
    assert.strictEqual(typeof Transaction.begin, "function");
    assert.strictEqual(typeof transactionBegin, "function");
  });
});
