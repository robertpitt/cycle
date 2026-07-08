import { Cache, Context, Effect, Layer } from "effect";
import {
  ObjectDecodeError,
  ObjectNotFoundError,
  ObjectTypeMismatchError,
  type GitStoreError,
} from "./GitStoreErrors.ts";
import type {
  GitObjectType,
  Identity,
  IdentityInput,
  ObjectId,
  TreeEntry,
} from "./GitStoreSchemas.ts";
import { bytesFromString, bytesToString } from "./internal/bytes.ts";
import {
  bytesToObjectId,
  compareTreeEntries,
  encodeTreeBody,
  type GitObject,
} from "./internal/git-object.ts";
import { formatIdentity, parseIdentity } from "./internal/identity.ts";
import { validateObjectId } from "./internal/refs.ts";
import { splitLines, stripTrailingNewline } from "./internal/strings.ts";
import { LooseObjectStore } from "./LooseObjectStore.ts";
import { ObjectCodec } from "./ObjectCodec.ts";
import { PackObjectStore } from "./PackObjectStore.ts";

export type CommitObject = {
  readonly author?: Identity;
  readonly committer?: Identity;
  readonly id: ObjectId;
  readonly message: string;
  readonly parents: ReadonlyArray<ObjectId>;
  readonly tree: ObjectId;
};

export type CommitSummary = {
  readonly committerTime?: number;
  readonly id: ObjectId;
  readonly parents: ReadonlyArray<ObjectId>;
  readonly tree: ObjectId;
};

export type WriteCommitInput = {
  readonly author: IdentityInput;
  readonly committer?: IdentityInput;
  readonly message: string;
  readonly parents?: ReadonlyArray<ObjectId>;
  readonly tree: ObjectId;
};

export type ObjectStoreShape = {
  readonly isAncestor: (
    ancestor: ObjectId,
    descendant: ObjectId,
  ) => Effect.Effect<boolean, GitStoreError>;
  readonly isCommit: (id: ObjectId) => Effect.Effect<boolean, GitStoreError>;
  readonly mergeBase: (
    left: ObjectId,
    right: ObjectId,
  ) => Effect.Effect<ObjectId | null, GitStoreError>;
  readonly readBlob: (id: ObjectId) => Effect.Effect<Uint8Array, GitStoreError>;
  readonly readCommit: (id: ObjectId) => Effect.Effect<CommitObject, GitStoreError>;
  readonly readObject: (
    id: ObjectId,
    expectedType?: GitObjectType,
  ) => Effect.Effect<GitObject, GitStoreError>;
  readonly readTree: (id: ObjectId) => Effect.Effect<ReadonlyArray<TreeEntry>, GitStoreError>;
  readonly rootCommits: (start: ObjectId) => Effect.Effect<ReadonlyArray<ObjectId>, GitStoreError>;
  readonly writeBlob: (bytes: Uint8Array) => Effect.Effect<ObjectId, GitStoreError>;
  readonly writeCommit: (input: WriteCommitInput) => Effect.Effect<ObjectId, GitStoreError>;
  readonly writeObject: (
    type: GitObjectType,
    body: Uint8Array,
  ) => Effect.Effect<ObjectId, GitStoreError>;
  readonly writeTree: (
    entries: ReadonlyArray<Omit<TreeEntry, "path">>,
  ) => Effect.Effect<ObjectId, GitStoreError>;
};

export class ObjectStore extends Context.Service<ObjectStore, ObjectStoreShape>()(
  "@cycle/git-store/ObjectStore",
) {}

export const ObjectStoreLive = Layer.effect(
  ObjectStore,
  Effect.gen(function* () {
    const loose = yield* LooseObjectStore;
    const packed = yield* PackObjectStore;
    const codec = yield* ObjectCodec;

    const objectCache = yield* Cache.make<ObjectId, GitObject, GitStoreError>({
      capacity: 4096,
      lookup: (id) =>
        loose.readObjectOption(id).pipe(
          Effect.flatMap((looseObject) =>
            looseObject === null
              ? packed.readObject(id).pipe(
                  Effect.flatMap((packedObject) =>
                    packedObject === null
                      ? Effect.fail(
                          new ObjectNotFoundError({
                            message: `Object not found: ${id}`,
                            objectId: id,
                          }),
                        )
                      : Effect.succeed(packedObject),
                  ),
                )
              : Effect.succeed(looseObject),
          ),
          Effect.flatMap((object) =>
            codec.hash(object.type, object.body).pipe(
              Effect.flatMap((actual) =>
                actual === id
                  ? Effect.succeed(object)
                  : Effect.fail(
                      new ObjectDecodeError({
                        message: `Object ${id} has digest ${actual}`,
                        objectId: id,
                      }),
                    ),
              ),
            ),
          ),
        ),
    });
    const commitSummaryCache = yield* Cache.make<ObjectId, CommitSummary, GitStoreError>({
      capacity: 2048,
      lookup: (id) => readCommitUncached(id).pipe(Effect.map(commitToSummary)),
    });

    const readObject = Effect.fn("ObjectStore.readObject")(function* (
      id: ObjectId,
      expectedType?: GitObjectType,
    ) {
      const normalized = yield* validateObjectId(id);
      const object = yield* Cache.get(objectCache, normalized);

      if (expectedType !== undefined && object.type !== expectedType) {
        return yield* new ObjectTypeMismatchError({
          actual: object.type,
          expected: expectedType,
          message: `Object ${id} expected ${expectedType} but contained ${object.type}`,
          objectId: id,
        });
      }

      return object;
    });

    const writeObject = Effect.fn("ObjectStore.writeObject")(function* (
      type: GitObjectType,
      body: Uint8Array,
    ) {
      const id = yield* loose.writeObject(type, body);
      yield* Cache.set(objectCache, id, { body, type });

      return id;
    });

    const readBlob = Effect.fn("ObjectStore.readBlob")(function* (id: ObjectId) {
      return (yield* readObject(id, "blob")).body;
    });

    const writeBlob = Effect.fn("ObjectStore.writeBlob")(function* (bytes: Uint8Array) {
      return yield* writeObject("blob", bytes);
    });

    const readTree = Effect.fn("ObjectStore.readTree")(function* (id: ObjectId) {
      const object = yield* readObject(id, "tree");

      return yield* parseTreeBody(object.body);
    });

    const writeTree = Effect.fn("ObjectStore.writeTree")(function* (
      entries: ReadonlyArray<Omit<TreeEntry, "path">>,
    ) {
      const body = yield* encodeTreeBody(entries);

      return yield* writeObject("tree", body);
    });

    function readCommitUncached(id: ObjectId): Effect.Effect<CommitObject, GitStoreError> {
      return readObject(id, "commit").pipe(
        Effect.flatMap((object) => parseCommit(id, object.body)),
      );
    }

    const readCommit = Effect.fn("ObjectStore.readCommit")(function* (id: ObjectId) {
      return yield* readCommitUncached(id);
    });

    const writeCommit = Effect.fn("ObjectStore.writeCommit")(function* (input: WriteCommitInput) {
      const now = input.author.date ?? new Date(0).toISOString();
      const author = normalizeIdentity(input.author, now);
      const committer = normalizeIdentity(
        input.committer ?? input.author,
        input.committer?.date ?? now,
      );
      const parents = input.parents ?? [];
      const headers = [
        `tree ${input.tree}`,
        ...parents.map((parent) => `parent ${parent}`),
        `author ${formatIdentity(author)}`,
        `committer ${formatIdentity(committer)}`,
      ];
      const body = bytesFromString(`${headers.join("\n")}\n\n${input.message}\n`);
      const id = yield* writeObject("commit", body);

      yield* Cache.set(commitSummaryCache, id, {
        committerTime: committer.timestamp,
        id,
        parents,
        tree: input.tree,
      });

      return id;
    });

    const isCommit = Effect.fn("ObjectStore.isCommit")(function* (id: ObjectId) {
      return yield* readObject(id, "commit").pipe(
        Effect.as(true),
        Effect.catch(() => Effect.succeed(false)),
      );
    });

    const rootCommits = Effect.fn("ObjectStore.rootCommits")(function* (start: ObjectId) {
      const roots = new Set<ObjectId>();
      const seen = new Set<ObjectId>();
      const queue = [start];

      while (queue.length > 0) {
        const current = queue.shift();

        if (current === undefined || seen.has(current)) continue;

        seen.add(current);
        const summary = yield* Cache.get(commitSummaryCache, current);

        if (summary.parents.length === 0) roots.add(summary.id);
        else queue.push(...summary.parents);
      }

      return [...roots].sort();
    });

    const isAncestor = Effect.fn("ObjectStore.isAncestor")(function* (
      ancestor: ObjectId,
      descendant: ObjectId,
    ) {
      if (ancestor === descendant) return true;

      const seen = new Set<ObjectId>();
      const queue = [descendant];

      while (queue.length > 0) {
        const current = queue.shift();

        if (current === undefined || seen.has(current)) continue;
        if (current === ancestor) return true;

        seen.add(current);
        const summary = yield* Cache.get(commitSummaryCache, current).pipe(
          Effect.catch(() => Effect.succeed(null)),
        );

        if (summary !== null) queue.push(...summary.parents);
      }

      return false;
    });

    const mergeBase = Effect.fn("ObjectStore.mergeBase")(function* (
      left: ObjectId,
      right: ObjectId,
    ) {
      const leftAncestors = yield* collectAncestors(commitSummaryCache, left);
      const seen = new Set<ObjectId>();
      const queue = [right];

      while (queue.length > 0) {
        const current = queue.shift();

        if (current === undefined || seen.has(current)) continue;
        if (leftAncestors.has(current)) return current;

        seen.add(current);
        const summary = yield* Cache.get(commitSummaryCache, current).pipe(
          Effect.catch(() => Effect.succeed(null)),
        );

        if (summary !== null) queue.push(...summary.parents);
      }

      return null;
    });

    return ObjectStore.of({
      isAncestor,
      isCommit,
      mergeBase,
      readBlob,
      readCommit,
      readObject,
      readTree,
      rootCommits,
      writeBlob,
      writeCommit,
      writeObject,
      writeTree,
    });
  }),
);

const parseTreeBody = (body: Uint8Array): Effect.Effect<ReadonlyArray<TreeEntry>, GitStoreError> =>
  Effect.gen(function* () {
    const entries: Array<TreeEntry> = [];
    let offset = 0;

    while (offset < body.byteLength) {
      const modeEnd = body.indexOf(0x20, offset);

      if (modeEnd === -1) {
        return yield* new ObjectDecodeError({
          message: "Tree entry is missing mode separator",
        });
      }

      const nameEnd = body.indexOf(0, modeEnd + 1);

      if (nameEnd === -1) {
        return yield* new ObjectDecodeError({
          message: "Tree entry is missing name terminator",
        });
      }

      const objectStart = nameEnd + 1;
      const objectEnd = objectStart + 20;

      if (objectEnd > body.byteLength) {
        return yield* new ObjectDecodeError({
          message: "Tree entry is missing object id bytes",
        });
      }

      const rawMode = bytesToString(body.subarray(offset, modeEnd));
      const name = bytesToString(body.subarray(modeEnd + 1, nameEnd));
      const objectId = yield* bytesToObjectId(body.subarray(objectStart, objectEnd));
      const type = rawMode === "40000" || rawMode === "040000" ? "tree" : "blob";

      entries.push({
        mode: rawMode === "40000" ? "040000" : rawMode,
        name,
        objectId,
        path: name as TreeEntry["path"],
        type,
      });
      offset = objectEnd;
    }

    return entries.sort(compareTreeEntries);
  });

const parseCommit = (id: ObjectId, body: Uint8Array): Effect.Effect<CommitObject, GitStoreError> =>
  Effect.gen(function* () {
    const raw = bytesToString(body);
    const separator = raw.indexOf("\n\n");
    const headerText = separator === -1 ? raw : raw.slice(0, separator);
    const message = separator === -1 ? "" : stripTrailingNewline(raw.slice(separator + 2));
    const parents: Array<ObjectId> = [];
    let tree: ObjectId | undefined;
    let author: Identity | undefined;
    let committer: Identity | undefined;

    for (const line of splitLines(headerText)) {
      if (line.startsWith("tree ")) {
        tree = yield* validateObjectId(line.slice("tree ".length));
      } else if (line.startsWith("parent ")) {
        parents.push(yield* validateObjectId(line.slice("parent ".length)));
      } else if (line.startsWith("author ")) {
        author = parseIdentity(line.slice("author ".length));
      } else if (line.startsWith("committer ")) {
        committer = parseIdentity(line.slice("committer ".length));
      }
    }

    if (tree === undefined) {
      return yield* new ObjectDecodeError({
        message: `Commit ${id} does not contain a tree`,
        objectId: id,
      });
    }

    return {
      author,
      committer,
      id,
      message,
      parents,
      tree,
    };
  });

const commitToSummary = (commit: CommitObject): CommitSummary => ({
  committerTime: commit.committer?.timestamp,
  id: commit.id,
  parents: commit.parents,
  tree: commit.tree,
});

const collectAncestors = (
  cache: Cache.Cache<ObjectId, CommitSummary, GitStoreError>,
  start: ObjectId,
): Effect.Effect<Set<ObjectId>, GitStoreError> =>
  Effect.gen(function* () {
    const output = new Set<ObjectId>();
    const queue = [start];

    while (queue.length > 0) {
      const current = queue.shift();

      if (current === undefined || output.has(current)) continue;

      output.add(current);
      const summary = yield* Cache.get(cache, current).pipe(
        Effect.catch(() => Effect.succeed(null)),
      );

      if (summary !== null) queue.push(...summary.parents);
    }

    return output;
  });

const normalizeIdentity = (identity: IdentityInput, now: string | Date): Identity => {
  const date =
    identity.date instanceof Date
      ? identity.date.toISOString()
      : (identity.date ?? (now instanceof Date ? now.toISOString() : now));
  const timestamp = Number.isFinite(Date.parse(date)) ? Math.floor(Date.parse(date) / 1000) : 0;

  return {
    date,
    email: identity.email,
    name: identity.name,
    timestamp,
    timezone: identity.timezone ?? "+0000",
  };
};
