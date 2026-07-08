import { Context, Crypto, Effect, Encoding, Layer } from "effect";
import {
  FilesystemProtocolError,
  RepositoryIdentityConflictError,
  causeMessage,
  type GitStoreError,
} from "./GitStoreErrors.ts";
import type { ObjectId, RefName } from "./GitStoreSchemas.ts";
import { CommitWriter } from "./CommitWriter.ts";
import { GitRemoteTransport } from "./GitRemoteTransport.ts";
import { ObjectStore } from "./ObjectStore.ts";
import { RefReader } from "./RefReader.ts";
import { RefTransaction } from "./RefTransaction.ts";

export type EnsureRepositoryIdentityOptions = {
  readonly remote?: string;
};

export type RepositoryIdentityInfo = {
  readonly ref: RefName;
  readonly repositoryId: string;
  readonly rootCommitId: ObjectId;
};

export type RepositoryIdentityShape = {
  readonly ensureIdentity: (
    options?: EnsureRepositoryIdentityOptions,
  ) => Effect.Effect<RepositoryIdentityInfo, GitStoreError>;
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
    const refTx = yield* RefTransaction;
    const commits = yield* CommitWriter;
    const crypto = yield* Crypto.Crypto;
    const remote = yield* GitRemoteTransport;
    const identityRef = "refs/gitdb/cycle/main" as RefName;
    const bootstrapIdentity = {
      email: "cycle@example.invalid",
      name: "Cycle",
    } as const;

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

    const adoptRemoteIdentity = Effect.fn("RepositoryIdentity.adoptRemoteIdentity")(function* (
      remoteName: string,
    ) {
      const remoteHead = yield* remote.lsRemote({
        ref: identityRef,
        remote: remoteName,
      });

      if (remoteHead === null) return null;

      yield* remote.fetch({
        ref: identityRef,
        remote: remoteName,
      });

      const remoteIdentity = yield* identityFromHead(remoteHead);
      const localIdentity = yield* resolveIdentity();

      if (
        localIdentity !== null &&
        localIdentity.rootCommitId !== remoteIdentity.rootCommitId
      ) {
        return yield* new RepositoryIdentityConflictError({
          message: `Repository identity conflict between local ${localIdentity.rootCommitId} and remote ${remoteIdentity.rootCommitId}`,
          ref: identityRef,
          roots: [localIdentity.rootCommitId, remoteIdentity.rootCommitId],
        });
      }

      if (localIdentity === null) {
        yield* refTx.update(identityRef, remoteHead, { expected: null }).pipe(
          Effect.catchTag("RefExpectedValueConflictError", () => Effect.void),
        );
      }

      return remoteIdentity;
    });

    const ensureIdentity = Effect.fn("RepositoryIdentity.ensureIdentity")(function* (
      options: EnsureRepositoryIdentityOptions = {},
    ) {
      const existing = yield* resolveIdentity();

      if (options.remote !== undefined) {
        const remoteIdentity = yield* adoptRemoteIdentity(options.remote);

        if (existing !== null && remoteIdentity === null) return existing;
        if (remoteIdentity !== null) return remoteIdentity;
      } else if (existing !== null) {
        return existing;
      }

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
          author: bootstrapIdentity,
          committer: bootstrapIdentity,
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
