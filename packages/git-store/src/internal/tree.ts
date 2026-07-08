import { Effect } from "effect";
import type { GitStoreError } from "../GitStoreErrors.ts";
import type { ObjectId, TreeEntry } from "../GitStoreSchemas.ts";
import { joinStorePath } from "../GitStoreSchemas.ts";

export type GitTree = {
  readonly readTree: (id: ObjectId) => Effect.Effect<ReadonlyArray<TreeEntry>, GitStoreError>;
  readonly writeBlob: (bytes: Uint8Array) => Effect.Effect<ObjectId, GitStoreError>;
  readonly writeTree: (
    entries: ReadonlyArray<Omit<TreeEntry, "path">>,
  ) => Effect.Effect<ObjectId, GitStoreError>;
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

export const loadMutableTree = (treeId: ObjectId | null): MutableTree => ({
  ...(treeId === null ? { entries: new Map<string, MutableNode>() } : {}),
  kind: "tree",
  objectId: treeId ?? undefined,
});

export const writeMutableTree: (
  git: GitTree,
  tree: MutableTree,
) => Effect.Effect<ObjectId, GitStoreError> = Effect.fn("writeMutableTree")(function* (git, tree) {
  if (tree.dirty !== true && tree.objectId !== undefined) return tree.objectId;

  const entries = yield* entriesOf(git, tree);
  const output: Array<Omit<TreeEntry, "path">> = [];

  for (const [name, node] of entries) {
    if (node.kind === "tree") {
      if (node.entries !== undefined && node.entries.size === 0) continue;

      output.push({
        mode: "040000",
        name,
        objectId: yield* writeMutableTree(git, node),
        type: "tree",
      });
    } else {
      output.push({
        mode: node.mode,
        name,
        objectId: node.objectId ?? (yield* git.writeBlob(node.bytes ?? new Uint8Array())),
        type: "blob",
      });
    }
  }

  return yield* git.writeTree(output);
});

export const applyMutation: (
  git: GitTree,
  root: MutableTree,
  path: string,
  mutation: PendingMutation,
) => Effect.Effect<void, GitStoreError> = Effect.fn("applyMutation")(
  function* (git, root, path, mutation) {
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
  },
);

export const entriesOf: (
  git: Pick<GitTree, "readTree">,
  tree: MutableTree,
) => Effect.Effect<Map<string, MutableNode>, GitStoreError> = Effect.fn("entriesOf")(
  function* (git, tree) {
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
  },
);

export const entryAtPath: (
  git: Pick<GitTree, "readTree">,
  rootTree: ObjectId,
  path: string,
) => Effect.Effect<TreeEntry | null, GitStoreError> = Effect.fn("entryAtPath")(
  function* (git, rootTree, path) {
    if (path === "") {
      return {
        mode: "040000",
        name: "",
        objectId: rootTree,
        path: "" as TreeEntry["path"],
        type: "tree",
      };
    }

    const segments = path.split("/");
    let treeId = rootTree;
    let currentPath = "";

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const entries = yield* git.readTree(treeId);
      const entry = entries.find((item) => item.name === segment);

      if (entry === undefined) return null;

      currentPath = joinStorePath(currentPath, entry.name);
      if (index === segments.length - 1)
        return { ...entry, path: currentPath as TreeEntry["path"] };
      if (entry.type !== "tree") return null;

      treeId = entry.objectId;
    }

    return null;
  },
);

export const flattenTree: (
  git: Pick<GitTree, "readTree">,
  rootTree: ObjectId,
  prefix?: string,
) => Effect.Effect<Map<string, ObjectId>, GitStoreError> = Effect.fn("flattenTree")(function* (
  git,
  rootTree,
  prefix = "",
) {
  const output = new Map<string, ObjectId>();

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

const setPath: (
  git: GitTree,
  root: MutableTree,
  segments: ReadonlyArray<string>,
  node: MutableNode,
) => Effect.Effect<void, GitStoreError> = Effect.fn("setPath")(
  function* (git, root, segments, node) {
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
        dirty: true,
        entries: new Map(),
        kind: "tree",
      };
      entries.set(segment, next);
      current = next;
    }

    const entries = yield* entriesOf(git, current);
    entries.set(segments.at(-1) ?? "", node);
    current.dirty = true;
  },
);

const deletePath: (
  git: GitTree,
  root: MutableTree,
  segments: ReadonlyArray<string>,
) => Effect.Effect<boolean, GitStoreError> = Effect.fn("deletePath")(
  function* (git, root, segments) {
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
  },
);
