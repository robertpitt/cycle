import { Clock, Crypto, Effect, Layer, TxRef } from "effect";
import type {
  CommitObject,
  DeleteRefInput,
  ObjectId,
  Ref as GitRef,
  TreeEntry,
  UpdateRefInput,
} from "../schemas/index.ts";
import { gitAdapterError, type GitAdapterError } from "../errors/index.ts";
import { bytesFromString } from "../internals/bytes.ts";
import { gitObjectId } from "../internals/hash.ts";
import { normalizeIdentity } from "../internals/identity.ts";
import { Git, type GitService } from "./Git.ts";

type InMemoryObject =
  | { readonly bytes: Uint8Array; readonly kind: "blob" }
  | { readonly entries: ReadonlyArray<TreeEntry>; readonly kind: "tree" }
  | { readonly commit: CommitObject; readonly kind: "commit" };

type InMemoryState = {
  readonly objects: Map<ObjectId, InMemoryObject>;
  readonly refs: Map<string, ObjectId>;
};

type RefUpdateResult =
  | { readonly _tag: "ok" }
  | { readonly _tag: "error"; readonly error: GitAdapterError };

export const layer = Layer.effect(
  Git,
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const state = yield* TxRef.make<InMemoryState>({
      objects: new Map(),
      refs: new Map(),
    });
    const objectId = (type: string, payload: Uint8Array) =>
      gitObjectId(type, payload).pipe(Effect.provideService(Crypto.Crypto, crypto));

    const service: GitService = {
      deleteRef: (_store, input) =>
        modifyRef(state, input, "in-memory deleteRef", (next) => {
          next.refs.delete(input.ref);
        }),
      fetch: () => Effect.succeed(undefined),
      isAncestor: (_store, ancestor, descendant) =>
        TxRef.get(state).pipe(Effect.map((current) => isAncestor(current, ancestor, descendant))),
      isCommit: (_store, id) =>
        TxRef.get(state).pipe(Effect.map((current) => current.objects.get(id)?.kind === "commit")),
      listRefs: (_store, prefix) =>
        TxRef.get(state).pipe(
          Effect.map(
            (current): ReadonlyArray<GitRef> =>
              [...current.refs]
                .filter(([name]) => name.startsWith(prefix))
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([name, target]) => ({ name, target })),
          ),
        ),
      mergeBase: (_store, a, b) =>
        TxRef.get(state).pipe(Effect.map((current) => mergeBase(current, a, b))),
      push: () => Effect.succeed(undefined),
      readBlob: (_store, id) =>
        TxRef.get(state).pipe(
          Effect.flatMap((current) => {
            const object = current.objects.get(id);

            return object?.kind === "blob"
              ? Effect.succeed(new Uint8Array(object.bytes))
              : Effect.fail(gitAdapterError("in-memory readBlob", `Blob not found: ${id}`));
          }),
        ),
      readCommit: (_store, id) =>
        TxRef.get(state).pipe(
          Effect.flatMap((current) => {
            const object = current.objects.get(id);

            return object?.kind === "commit"
              ? Effect.succeed(object.commit)
              : Effect.fail(gitAdapterError("in-memory readCommit", `Commit not found: ${id}`));
          }),
        ),
      readRef: (_store, name) =>
        TxRef.get(state).pipe(Effect.map((current) => current.refs.get(name) ?? null)),
      readTree: (_store, id) =>
        TxRef.get(state).pipe(
          Effect.flatMap((current) => {
            const object = current.objects.get(id);

            return object?.kind === "tree"
              ? Effect.succeed(object.entries)
              : Effect.fail(gitAdapterError("in-memory readTree", `Tree not found: ${id}`));
          }),
        ),
      updateRef: (_store, input) =>
        modifyRef(state, input, "in-memory updateRef", (next) => {
          next.refs.set(input.ref, input.target);
        }),
      writeBlob: (_store, bytes) =>
        Effect.gen(function* () {
          const copy = new Uint8Array(bytes);
          const id = yield* objectId("blob", copy);

          yield* TxRef.update(state, (current) => {
            current.objects.set(id, {
              bytes: copy,
              kind: "blob",
            });

            return current;
          });

          return id;
        }),
      writeCommit: (_store, input) =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          const author = normalizeIdentity(input.author, now);
          const committer = normalizeIdentity(input.committer ?? input.author, now);
          const message = input.message ?? "Update GitDB snapshot";
          const parents = input.parents ?? [];
          const payload = bytesFromString(
            JSON.stringify({
              author,
              committer,
              message,
              parents,
              tree: input.tree,
            }),
          );
          const id = yield* objectId("commit", payload);
          const commit: CommitObject = {
            author,
            committer,
            id,
            message: `${message}\n`,
            parents,
            tree: input.tree,
          };

          yield* TxRef.update(state, (current) => {
            current.objects.set(id, {
              commit,
              kind: "commit",
            });

            return current;
          });

          return id;
        }),
      writeTree: (_store, entries) =>
        Effect.gen(function* () {
          const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
          const payload = bytesFromString(JSON.stringify(sorted));
          const id = yield* objectId("tree", payload);

          yield* TxRef.update(state, (current) => {
            current.objects.set(id, {
              entries: sorted,
              kind: "tree",
            });

            return current;
          });

          return id;
        }),
    };

    return service;
  }),
);

export const InMemory = layer;

const modifyRef = (
  state: TxRef.TxRef<InMemoryState>,
  input: DeleteRefInput | UpdateRefInput,
  operation: string,
  update: (state: InMemoryState) => void,
): Effect.Effect<void, GitAdapterError> =>
  TxRef.modify(state, (current): [RefUpdateResult, InMemoryState] => {
    const actual = current.refs.get(input.ref) ?? null;

    if ("expected" in input && actual !== (input.expected ?? null)) {
      return [
        {
          _tag: "error",
          error: gitAdapterError(
            operation,
            `ref ${input.ref} expected ${input.expected ?? "<missing>"} but was ${
              actual ?? "<missing>"
            }`,
          ),
        },
        current,
      ];
    }

    const next = cloneState(current);
    update(next);

    return [{ _tag: "ok" }, next];
  }).pipe(
    Effect.flatMap((result) =>
      result._tag === "ok" ? Effect.succeed(undefined) : Effect.fail(result.error),
    ),
  );

const cloneState = (state: InMemoryState): InMemoryState => ({
  objects: new Map(state.objects),
  refs: new Map(state.refs),
});

const isAncestor = (state: InMemoryState, ancestor: ObjectId, descendant: ObjectId): boolean => {
  if (ancestor === descendant) return true;

  const seen = new Set<ObjectId>();
  const stack = [descendant];

  while (stack.length > 0) {
    const current = stack.shift();

    if (current === undefined || seen.has(current)) continue;
    if (current === ancestor) return true;

    seen.add(current);
    const object = state.objects.get(current);

    if (object?.kind === "commit") {
      stack.push(...object.commit.parents);
    }
  }

  return false;
};

const mergeBase = (state: InMemoryState, a: ObjectId, b: ObjectId): ObjectId | null => {
  const aAncestors = collectAncestors(state, a);
  const queue = [b];
  const seen = new Set<ObjectId>();

  while (queue.length > 0) {
    const current = queue.shift();

    if (current === undefined || seen.has(current)) continue;
    if (aAncestors.has(current)) return current;

    seen.add(current);
    const object = state.objects.get(current);

    if (object?.kind === "commit") {
      queue.push(...object.commit.parents);
    }
  }

  return null;
};

const collectAncestors = (state: InMemoryState, start: ObjectId): Set<ObjectId> => {
  const output = new Set<ObjectId>();
  const stack = [start];

  while (stack.length > 0) {
    const current = stack.shift();

    if (current === undefined || output.has(current)) continue;

    output.add(current);
    const object = state.objects.get(current);

    if (object?.kind === "commit") {
      stack.push(...object.commit.parents);
    }
  }

  return output;
};
