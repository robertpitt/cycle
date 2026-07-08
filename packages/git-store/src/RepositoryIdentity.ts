import { Context, Crypto, Effect, Encoding, Layer } from "effect";
import {
  FilesystemProtocolError,
  RepositoryIdentityConflictError,
  causeMessage,
  type GitStoreError,
} from "./GitStoreErrors.ts";
import type { ObjectId, RefName } from "./GitStoreSchemas.ts";
import { CommitWriter } from "./CommitWriter.ts";
import { ObjectStore } from "./ObjectStore.ts";
import { RefReader } from "./RefReader.ts";

export type RepositoryIdentityInfo = {
  readonly ref: RefName;
  readonly repositoryId: string;
  readonly rootCommitId: ObjectId;
};

export type RepositoryIdentityShape = {
  readonly ensureIdentity: () => Effect.Effect<RepositoryIdentityInfo, GitStoreError>;
  readonly resolveIdentity: () => Effect.Effect<RepositoryIdentityInfo | null, GitStoreError>;
};

export class RepositoryIdentity extends Context.Service<
  RepositoryIdentity,
  RepositoryIdentityShape
>()("@cycle/git-store/RepositoryIdentity") {}

export const RepositoryIdentityLive = Layer.effect(
  RepositoryIdentity,
  Effect.gen(function* () {
    const objects = yield* ObjectStore;
    const refs = yield* RefReader;
    const commits = yield* CommitWriter;
    const crypto = yield* Crypto.Crypto;
    const identityRef = "refs/gitdb/cycle/main" as RefName;

    const identityFromHead = Effect.fn("RepositoryIdentity.identityFromHead")(function* (
      head: ObjectId,
    ) {
      const roots = yield* objects.rootCommits(head);

      if (roots.length !== 1) {
        return yield* new RepositoryIdentityConflictError({
          message: `Repository identity expected one root commit, found ${roots.length}`,
          ref: identityRef,
          roots,
        });
      }

      const rootCommitId = roots[0] as ObjectId;

      return {
        ref: identityRef,
        repositoryId: `repo_${rootCommitId.slice(0, 5)}`,
        rootCommitId,
      };
    });

    const resolveIdentity = Effect.fn("RepositoryIdentity.resolveIdentity")(function* () {
      const head = yield* refs.read(identityRef);

      return head === null ? null : yield* identityFromHead(head);
    });

    const ensureIdentity = Effect.fn("RepositoryIdentity.ensureIdentity")(function* () {
      const existing = yield* resolveIdentity();

      if (existing !== null) return existing;

      const random = yield* crypto.randomBytes(16).pipe(
        Effect.mapError(
          (cause) =>
            new FilesystemProtocolError({
              cause,
              message: `generate repository identity seed failed: ${causeMessage(cause)}`,
              operation: "generate repository identity seed",
              path: identityRef,
            }),
        ),
      );
      const seed = Encoding.encodeHex(random).toLowerCase();
      const emptyTree = yield* objects.writeTree([]);
      const commitId = yield* commits
        .commitToRef({
          expected: null,
          message: `Initialize Cycle GitDB\n\nSeed: ${seed}`,
          parents: [],
          ref: identityRef,
          tree: emptyTree,
        })
        .pipe(
          Effect.catchTag("RefExpectedValueConflictError", () =>
            resolveIdentity().pipe(
              Effect.flatMap((identity) =>
                identity === null
                  ? Effect.fail(
                      new RepositoryIdentityConflictError({
                        message: "Identity ref appeared during bootstrap but could not be resolved",
                        ref: identityRef,
                        roots: [],
                      }),
                    )
                  : Effect.succeed(identity.rootCommitId),
              ),
            ),
          ),
        );

      return yield* identityFromHead(commitId);
    });

    return RepositoryIdentity.of({
      ensureIdentity,
      resolveIdentity,
    });
  }),
);
