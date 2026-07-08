import { Clock, Context, Effect, Layer } from "effect";
import { MissingCommitIdentityError, type GitStoreError } from "./GitStoreErrors.ts";
import type { IdentityInput, ObjectId, RefName } from "./GitStoreSchemas.ts";
import { GitStoreRuntime } from "./internal/runtime.ts";
import { ObjectStore } from "./ObjectStore.ts";
import { RefTransaction } from "./RefTransaction.ts";

export type WriteCommitObjectInput = {
  readonly author?: IdentityInput;
  readonly committer?: IdentityInput;
  readonly message: string;
  readonly parents?: ReadonlyArray<ObjectId>;
  readonly tree: ObjectId;
};

export type CommitToRefInput = WriteCommitObjectInput & {
  readonly expected?: ObjectId | null;
  readonly ref: RefName;
};

export type CommitWriterShape = {
  readonly commitToRef: (input: CommitToRefInput) => Effect.Effect<ObjectId, GitStoreError>;
  readonly writeCommitObject: (
    input: WriteCommitObjectInput,
  ) => Effect.Effect<ObjectId, GitStoreError>;
};

export class CommitWriter extends Context.Service<CommitWriter, CommitWriterShape>()(
  "@cycle/git-store/CommitWriter",
) {}

export const CommitWriterLive = Layer.effect(
  CommitWriter,
  Effect.gen(function* () {
    const objects = yield* ObjectStore;
    const refs = yield* RefTransaction;
    const runtime = yield* GitStoreRuntime;

    const resolveIdentity = Effect.fn("CommitWriter.resolveIdentity")(function* (
      input: WriteCommitObjectInput,
    ) {
      const now = yield* Clock.currentTimeMillis;
      const date = new Date(now).toISOString();
      const author = input.author ?? runtime.config.identity;

      if (author === undefined) {
        return yield* new MissingCommitIdentityError({
          message: "Commit identity is required",
        });
      }

      return {
        author: {
          ...author,
          date: author.date ?? date,
        },
        committer: {
          ...(input.committer ?? author),
          date: (input.committer ?? author).date ?? date,
        },
      };
    });

    const writeCommitObject = Effect.fn("CommitWriter.writeCommitObject")(function* (
      input: WriteCommitObjectInput,
    ) {
      const identity = yield* resolveIdentity(input);

      return yield* objects.writeCommit({
        author: identity.author,
        committer: identity.committer,
        message: input.message,
        parents: input.parents ?? [],
        tree: input.tree,
      });
    });

    const commitToRef = Effect.fn("CommitWriter.commitToRef")(function* (input: CommitToRefInput) {
      const commitId = yield* writeCommitObject(input);

      yield* refs.update(input.ref, commitId, { expected: input.expected });

      return commitId;
    });

    return CommitWriter.of({
      commitToRef,
      writeCommitObject,
    });
  }),
);
