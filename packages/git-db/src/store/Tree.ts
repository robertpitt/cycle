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
  readonly entries: Map<string, MutableNode>;
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
  git: GitTree,
  treeId: ObjectId | null,
): Effect.Effect<MutableTree, GitDbError> =>
  Effect.gen(function* () {
    const root: MutableTree = {
      entries: new Map(),
      kind: "tree",
      objectId: treeId ?? undefined,
    };

    if (treeId === null) return root;

    for (const entry of yield* git.readTree(treeId)) {
      if (entry.type === "tree") {
        root.entries.set(entry.name, yield* loadMutableTree(git, entry.objectId));
      } else {
        root.entries.set(entry.name, {
          kind: "blob",
          mode: entry.mode,
          objectId: entry.objectId,
        });
      }
    }

    return root;
  });

export const writeMutableTree = (
  git: GitTree,
  tree: MutableTree,
): Effect.Effect<ObjectId, GitDbError> =>
  Effect.gen(function* () {
    const entries: Array<TreeEntry> = [];

    for (const [name, node] of tree.entries) {
      if (node.kind === "tree") {
        if (node.entries.size === 0) continue;

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

export const applyMutation = (root: MutableTree, path: string, mutation: PendingMutation): void => {
  const segments = path.split("/");

  if (mutation.kind === "delete") {
    deletePath(root, segments);
    return;
  }

  setPath(root, segments, {
    bytes: mutation.bytes,
    kind: "blob",
    mode: "100644",
  });
};

export const nodeAtPath = (
  root: MutableTree,
  segments: ReadonlyArray<string>,
): MutableNode | null => {
  let current: MutableNode = root;

  for (const segment of segments) {
    if (current.kind !== "tree") return null;

    const next = current.entries.get(segment);

    if (next === undefined) return null;

    current = next;
  }

  return current;
};

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

const setPath = (root: MutableTree, segments: ReadonlyArray<string>, node: MutableNode): void => {
  let current = root;

  for (const segment of segments.slice(0, -1)) {
    const existing = current.entries.get(segment);

    if (existing?.kind === "tree") {
      current = existing;
      continue;
    }

    const next: MutableTree = {
      entries: new Map(),
      kind: "tree",
    };
    current.entries.set(segment, next);
    current = next;
  }

  current.entries.set(segments.at(-1) ?? "", node);
};

const deletePath = (root: MutableTree, segments: ReadonlyArray<string>): boolean => {
  const [head, ...tail] = segments;

  if (head === undefined) return false;

  if (tail.length === 0) return root.entries.delete(head);

  const child = root.entries.get(head);

  if (child?.kind !== "tree") return false;

  const deleted = deletePath(child, tail);

  if (child.entries.size === 0) {
    root.entries.delete(head);
  }

  return deleted;
};
