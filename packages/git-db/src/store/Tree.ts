import { Effect } from "effect";
import type { ObjectId, TreeEntry } from "@cycle/git/schemas";
import type { GitDbError } from "../errors/index.ts";
import { joinStorePath } from "./Path.ts";

export type GitTree = {
  readonly readTree: (id: ObjectId) => Effect.Effect<ReadonlyArray<TreeEntry>, GitDbError>;
  readonly writeBlob: (bytes: Uint8Array) => Effect.Effect<ObjectId, GitDbError>;
  readonly writeTree: (entries: ReadonlyArray<TreeEntry>) => Effect.Effect<ObjectId, GitDbError>;
};

export type MutableBlob = {
  readonly bytes?: Uint8Array;
  readonly kind: "blob";
  readonly mode: string;
  readonly objectId?: ObjectId;
};

export type MutableTree = {
  dirty?: boolean;
  entries?: Map<string, MutableNode>;
  readonly kind: "tree";
  readonly objectId?: ObjectId;
};

export type MutableNode = MutableBlob | MutableTree;

export type PendingMutation =
  | {
      readonly bytes: Uint8Array;
      readonly kind: "put";
    }
  | {
      readonly kind: "delete";
    };

export const loadMutableTree = (
  _git: GitTree,
  treeId: ObjectId | null,
): Effect.Effect<MutableTree, GitDbError> =>
  Effect.succeed({
    ...(treeId === null ? { entries: new Map<string, MutableNode>() } : {}),
    kind: "tree",
    objectId: treeId ?? undefined,
  });

export const writeMutableTree = (
  git: GitTree,
  tree: MutableTree,
): Effect.Effect<ObjectId, GitDbError> =>
  Effect.gen(function* () {
    if (tree.dirty !== true && tree.objectId !== undefined) return tree.objectId;

    const treeEntries = yield* entriesOf(git, tree);
    const entries: Array<TreeEntry> = [];

    for (const [name, node] of treeEntries) {
      if (node.kind === "tree") {
        if (node.entries !== undefined && node.entries.size === 0) continue;

        entries.push({
          mode: "040000",
          name,
          objectId: yield* writeMutableTree(git, node),
          type: "tree",
        });
      } else {
        entries.push({
          mode: node.mode,
          name,
          objectId: node.objectId ?? (yield* git.writeBlob(node.bytes ?? new Uint8Array())),
          type: "blob",
        });
      }
    }

    return yield* git.writeTree(entries);
  });

export const applyMutation = (
  git: GitTree,
  root: MutableTree,
  path: string,
  mutation: PendingMutation,
): Effect.Effect<void, GitDbError> =>
  Effect.gen(function* () {
    const segments = path.split("/");

    if (mutation.kind === "delete") {
      yield* deletePath(git, root, segments);
      return;
    }

    yield* setPath(git, root, segments, {
      bytes: mutation.bytes,
      kind: "blob",
      mode: "100644",
    });
  });

export const nodeAtPath = (
  git: Pick<GitTree, "readTree">,
  root: MutableTree,
  segments: ReadonlyArray<string>,
): Effect.Effect<MutableNode | null, GitDbError> =>
  Effect.gen(function* () {
    let current: MutableNode = root;

    for (const segment of segments) {
      if (current.kind !== "tree") return null;

      const next = (yield* entriesOf(git, current)).get(segment);

      if (next === undefined) return null;

      current = next;
    }

    return current;
  });

export const entriesOf = (
  git: Pick<GitTree, "readTree">,
  tree: MutableTree,
): Effect.Effect<Map<string, MutableNode>, GitDbError> =>
  Effect.gen(function* () {
    if (tree.entries !== undefined) return tree.entries;

    const entries = new Map<string, MutableNode>();

    if (tree.objectId !== undefined) {
      for (const entry of yield* git.readTree(tree.objectId)) {
        entries.set(
          entry.name,
          entry.type === "tree"
            ? {
                kind: "tree",
                objectId: entry.objectId,
              }
            : {
                kind: "blob",
                mode: entry.mode,
                objectId: entry.objectId,
              },
        );
      }
    }

    tree.entries = entries;
    return entries;
  });

export const entryAtPath = (
  git: Pick<GitTree, "readTree">,
  rootTree: ObjectId,
  path: string,
): Effect.Effect<TreeEntry | null, GitDbError> =>
  Effect.gen(function* () {
    if (path === "") {
      return {
        mode: "040000",
        name: "",
        objectId: rootTree,
        type: "tree",
      } satisfies TreeEntry;
    }

    const segments = path.split("/");
    let treeId = rootTree;

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const entries = yield* git.readTree(treeId);
      const entry = entries.find((item) => item.name === segment);

      if (entry === undefined) return null;
      if (index === segments.length - 1) return entry;
      if (entry.type !== "tree") return null;

      treeId = entry.objectId;
    }

    return null;
  });

export const treeIdAtPath = (
  git: Pick<GitTree, "readTree">,
  rootTree: ObjectId,
  path: string,
): Effect.Effect<ObjectId | null, GitDbError> =>
  entryAtPath(git, rootTree, path).pipe(
    Effect.map((entry) => (entry?.type === "tree" ? entry.objectId : null)),
  );

export const flattenTree = (
  git: Pick<GitTree, "readTree">,
  rootTree: ObjectId,
  prefix = "",
): Effect.Effect<Map<string, string>, GitDbError> =>
  Effect.gen(function* () {
    const output = new Map<string, string>();

    for (const entry of yield* git.readTree(rootTree)) {
      const entryPath = joinStorePath(prefix, entry.name);

      if (entry.type === "tree") {
        for (const [nestedPath, objectId] of yield* flattenTree(git, entry.objectId, entryPath)) {
          output.set(nestedPath, objectId);
        }
      } else {
        output.set(entryPath, entry.objectId);
      }
    }

    return output;
  });

const setPath = (
  git: GitTree,
  root: MutableTree,
  segments: ReadonlyArray<string>,
  node: MutableNode,
): Effect.Effect<void, GitDbError> =>
  Effect.gen(function* () {
    let current = root;

    for (const segment of segments.slice(0, -1)) {
      const entries = yield* entriesOf(git, current);
      const existing = entries.get(segment);
      current.dirty = true;

      if (existing?.kind === "tree") {
        current = existing;
        continue;
      }

      const next: MutableTree = {
        entries: new Map(),
        dirty: true,
        kind: "tree",
      };
      entries.set(segment, next);
      current = next;
    }

    const entries = yield* entriesOf(git, current);
    entries.set(segments.at(-1) ?? "", node);
    current.dirty = true;
  });

const deletePath = (
  git: GitTree,
  root: MutableTree,
  segments: ReadonlyArray<string>,
): Effect.Effect<boolean, GitDbError> =>
  Effect.gen(function* () {
    const [head, ...tail] = segments;

    if (head === undefined) return false;

    const entries = yield* entriesOf(git, root);

    if (tail.length === 0) {
      const deleted = entries.delete(head);
      if (deleted) root.dirty = true;
      return deleted;
    }

    const child = entries.get(head);

    if (child?.kind !== "tree") return false;

    const deleted = yield* deletePath(git, child, tail);

    if (child.entries !== undefined && child.entries.size === 0) {
      entries.delete(head);
    }

    if (deleted) root.dirty = true;
    return deleted;
  });
