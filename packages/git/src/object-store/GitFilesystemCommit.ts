import { Cache, Clock, Effect } from "effect";
import type { ObjectId, WriteCommitInput } from "../schemas/index.ts";
import { gitAdapterError, type GitAdapterError } from "../errors/index.ts";
import { bytesFromString, bytesToString } from "../internals/bytes.ts";
import { formatIdentity, normalizeIdentity } from "../internals/identity.ts";
import { writeObject } from "./GitFilesystemObject.ts";
import {
  objectCacheKey,
  type CommitSummary,
  type FilesystemRuntime,
} from "./GitFilesystemTypes.ts";

export const writeFilesystemCommit = (
  runtime: FilesystemRuntime,
  gitDir: string,
  input: WriteCommitInput,
): Effect.Effect<ObjectId, GitAdapterError> =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const author = normalizeIdentity(input.author, now);
    const committer = normalizeIdentity(input.committer ?? input.author, now);
    const parents = input.parents ?? [];
    const headers = [
      `tree ${input.tree}`,
      ...parents.map((parent) => `parent ${parent}`),
      `author ${formatIdentity(author)}`,
      `committer ${formatIdentity(committer)}`,
    ];
    const message = input.message ?? "Update Git snapshot";
    const payload = bytesFromString(`${headers.join("\n")}\n\n${message}\n`);
    const id = yield* writeObject(runtime, gitDir, "commit", payload);

    yield* Cache.set(runtime.commitSummaries, objectCacheKey(gitDir, id), {
      committerTime: committer.timestamp,
      id,
      parents,
      tree: input.tree,
    });

    return id;
  });

export const isAncestor = (
  runtime: FilesystemRuntime,
  gitDir: string,
  ancestor: ObjectId,
  descendant: ObjectId,
): Effect.Effect<boolean, GitAdapterError> =>
  Effect.gen(function* () {
    if (ancestor === descendant) return true;

    const seen = new Set<ObjectId>();
    const queue = new CommitSummaryHeap();
    const start = yield* readCommitSummary(runtime, gitDir, descendant).pipe(
      Effect.catch(() => Effect.succeed(null)),
    );

    if (start !== null) queue.push(start);

    while (queue.size > 0) {
      const current = queue.pop();

      if (current === undefined || seen.has(current.id)) continue;
      if (current.id === ancestor) return true;

      seen.add(current.id);

      for (const parentId of current.parents) {
        if (seen.has(parentId)) continue;

        const parent = yield* readCommitSummary(runtime, gitDir, parentId).pipe(
          Effect.catch(() => Effect.succeed(null)),
        );

        if (parent !== null) queue.push(parent);
      }
    }

    return false;
  });

export const mergeBase = (
  runtime: FilesystemRuntime,
  gitDir: string,
  a: ObjectId,
  b: ObjectId,
): Effect.Effect<ObjectId | null, GitAdapterError> =>
  Effect.gen(function* () {
    const aAncestors = yield* collectAncestors(runtime, gitDir, a);
    const queue = new CommitSummaryHeap();
    const seen = new Set<ObjectId>();
    const start = yield* readCommitSummary(runtime, gitDir, b).pipe(
      Effect.catch(() => Effect.succeed(null)),
    );

    if (start !== null) queue.push(start);

    while (queue.size > 0) {
      const current = queue.pop();

      if (current === undefined || seen.has(current.id)) continue;
      if (aAncestors.has(current.id)) return current.id;

      seen.add(current.id);

      for (const parentId of current.parents) {
        if (seen.has(parentId)) continue;

        const parent = yield* readCommitSummary(runtime, gitDir, parentId).pipe(
          Effect.catch(() => Effect.succeed(null)),
        );

        if (parent !== null) queue.push(parent);
      }
    }

    return null;
  });

const collectAncestors = (
  runtime: FilesystemRuntime,
  gitDir: string,
  start: ObjectId,
): Effect.Effect<Set<ObjectId>, GitAdapterError> =>
  Effect.gen(function* () {
    const output = new Set<ObjectId>();
    const queue = new CommitSummaryHeap();
    const startSummary = yield* readCommitSummary(runtime, gitDir, start).pipe(
      Effect.catch(() => Effect.succeed(null)),
    );

    if (startSummary !== null) queue.push(startSummary);

    while (queue.size > 0) {
      const current = queue.pop();

      if (current === undefined || output.has(current.id)) continue;

      output.add(current.id);

      for (const parentId of current.parents) {
        if (output.has(parentId)) continue;

        const parent = yield* readCommitSummary(runtime, gitDir, parentId).pipe(
          Effect.catch(() => Effect.succeed(null)),
        );

        if (parent !== null) queue.push(parent);
      }
    }

    return output;
  });

const readCommitSummary = (
  runtime: FilesystemRuntime,
  gitDir: string,
  id: ObjectId,
): Effect.Effect<CommitSummary, GitAdapterError> =>
  Cache.get(runtime.commitSummaries, objectCacheKey(gitDir, id));

export const parseCommitSummary = (
  id: ObjectId,
  payload: Uint8Array,
): Effect.Effect<CommitSummary, GitAdapterError> => {
  const raw = bytesToString(payload);
  const separator = raw.indexOf("\n\n");
  const headerText = separator === -1 ? raw : raw.slice(0, separator);
  const parents: Array<ObjectId> = [];
  let committerTime: number | undefined;
  let tree: ObjectId | undefined;

  for (const line of headerText.split("\n")) {
    if (line.startsWith("tree ")) {
      tree = line.slice("tree ".length);
    } else if (line.startsWith("parent ")) {
      parents.push(line.slice("parent ".length));
    } else if (line.startsWith("committer ")) {
      committerTime = parseGitIdentityTimestamp(line.slice("committer ".length));
    }
  }

  if (tree === undefined) {
    return Effect.fail(
      gitAdapterError("filesystem commit summary", `Commit ${id} does not contain a tree`),
    );
  }

  return Effect.succeed({ committerTime, id, parents, tree });
};

const parseGitIdentityTimestamp = (raw: string): number | undefined => {
  const match = / (\d+) [+-]\d{4}$/u.exec(raw);

  return match === null ? undefined : Number.parseInt(match[1], 10);
};

class CommitSummaryHeap {
  private readonly values: Array<CommitSummary> = [];

  get size(): number {
    return this.values.length;
  }

  push(value: CommitSummary): void {
    this.values.push(value);
    this.bubbleUp(this.values.length - 1);
  }

  pop(): CommitSummary | undefined {
    const first = this.values[0];
    const last = this.values.pop();

    if (first === undefined || last === undefined) return first;
    if (this.values.length > 0) {
      this.values[0] = last;
      this.sinkDown(0);
    }

    return first;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);

      if (compareCommitSummary(this.values[index], this.values[parent]) <= 0) return;

      this.swap(index, parent);
      index = parent;
    }
  }

  private sinkDown(index: number): void {
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let largest = index;

      if (
        left < this.values.length &&
        compareCommitSummary(this.values[left], this.values[largest]) > 0
      ) {
        largest = left;
      }

      if (
        right < this.values.length &&
        compareCommitSummary(this.values[right], this.values[largest]) > 0
      ) {
        largest = right;
      }

      if (largest === index) return;

      this.swap(index, largest);
      index = largest;
    }
  }

  private swap(a: number, b: number): void {
    const left = this.values[a];
    const right = this.values[b];

    if (left === undefined || right === undefined) return;

    this.values[a] = right;
    this.values[b] = left;
  }
}

const compareCommitSummary = (a: CommitSummary, b: CommitSummary): number => {
  const byTime = (a.committerTime ?? 0) - (b.committerTime ?? 0);

  return byTime === 0 ? a.id.localeCompare(b.id) : byTime;
};
