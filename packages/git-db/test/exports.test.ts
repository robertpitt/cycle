import {
  Document as RootDocument,
  Event,
  GitDbFilesystem,
  Schemas,
  Store,
} from "@cycle/git-db";
import { Document } from "@cycle/git-db/document";
import { InvalidPathError, type GitDbError } from "@cycle/git-db/errors";
import { path as eventPath } from "@cycle/git-db/event";
import { GitDbInMemory } from "@cycle/git-db/live";
import { SyncResult } from "@cycle/git-db/schemas";
import { StoreService, type StoreServiceShape } from "@cycle/git-db/store";
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
    assert.strictEqual(typeof Schemas.SyncResult, "object");
    assert.strictEqual(typeof SyncResult, "object");
    assert.strictEqual(typeof Store.StoreService, "function");
    assert.strictEqual(typeof StoreService, "function");
  });
});
