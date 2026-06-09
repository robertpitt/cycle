import { Clock, Effect } from "effect";
import type {
  CommitObject,
  Identity,
  ObjectId,
  TreeEntry,
  WriteCommitInput,
} from "../domain/index.ts";
import { gitAdapterError, type GitAdapterError } from "../errors/index.ts";
import { normalizeIdentity } from "../internals/identity.ts";

export const parseTree = (raw: string): Effect.Effect<ReadonlyArray<TreeEntry>, GitAdapterError> =>
  Effect.forEach(raw.split("\0").filter(Boolean), (record) => {
    const match = /^(\d+) (blob|tree) ([0-9a-fA-F]+)\t(.+)$/u.exec(record);

    return match === null
      ? Effect.fail(
          gitAdapterError("git ls-tree", `Unexpected ls-tree record: ${record}`, {
            stderr: record,
          }),
        )
      : Effect.succeed({
          mode: match[1],
          name: match[4],
          objectId: match[3],
          type: match[2] as "blob" | "tree",
        });
  });

export const parseCommit = (
  id: ObjectId,
  raw: string,
): Effect.Effect<CommitObject, GitAdapterError> => {
  const separator = raw.indexOf("\n\n");
  const headerText = separator === -1 ? raw : raw.slice(0, separator);
  const message = separator === -1 ? "" : raw.slice(separator + 2);
  const parents: Array<ObjectId> = [];
  let tree: ObjectId | undefined;
  let author: Identity | undefined;
  let committer: Identity | undefined;

  for (const line of headerText.split("\n")) {
    if (line.startsWith("tree ")) {
      tree = line.slice("tree ".length);
    } else if (line.startsWith("parent ")) {
      parents.push(line.slice("parent ".length));
    } else if (line.startsWith("author ")) {
      author = parseIdentity(line.slice("author ".length));
    } else if (line.startsWith("committer ")) {
      committer = parseIdentity(line.slice("committer ".length));
    }
  }

  if (tree === undefined) {
    return Effect.fail(
      gitAdapterError("git cat-file commit", `Commit ${id} does not contain a tree`),
    );
  }

  return Effect.succeed({
    author,
    committer,
    id,
    message,
    parents,
    tree,
  });
};

export const commitEnv = (
  input: WriteCommitInput,
): Effect.Effect<Record<string, string | undefined>> =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const author = normalizeIdentity(input.author, now);
    const committer = normalizeIdentity(input.committer ?? input.author, now);

    return {
      GIT_AUTHOR_DATE: author.date,
      GIT_AUTHOR_EMAIL: author.email,
      GIT_AUTHOR_NAME: author.name,
      GIT_COMMITTER_DATE: committer.date,
      GIT_COMMITTER_EMAIL: committer.email,
      GIT_COMMITTER_NAME: committer.name,
    };
  });

const parseIdentity = (raw: string): Identity | undefined => {
  const match = /^(.*) <([^>]*)> (\d+) ([+-]\d{4})$/u.exec(raw);

  if (match === null) return undefined;

  const timestamp = Number.parseInt(match[3], 10);

  return {
    date: new Date(timestamp * 1000).toISOString(),
    email: match[2],
    name: match[1],
    timestamp,
    timezone: match[4],
  };
};
