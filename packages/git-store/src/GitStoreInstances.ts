import { NodeServices } from "@effect/platform-node";
import { GitLive } from "@cycle/git";
import { Layer, LayerMap } from "effect";
import { CommitWriterLive } from "./CommitWriter.ts";
import { EventStoreLive } from "./EventStore.ts";
import { GitRemoteTransportLive } from "./GitRemoteTransport.ts";
import { GitStoreLive } from "./GitStore.ts";
import { GitStoreChangesLive } from "./GitStoreChanges.ts";
import type { GitStoreConfig, GitStoreKey } from "./GitStoreSchemas.ts";
import { GitStoreSyncLive } from "./GitStoreSync.ts";
import { LooseObjectStoreLive } from "./LooseObjectStore.ts";
import { LooseRefStoreLive } from "./LooseRefStore.ts";
import { ObjectCodecLive } from "./ObjectCodec.ts";
import { ObjectStoreLive } from "./ObjectStore.ts";
import { PackIndexStoreLive } from "./PackIndexStore.ts";
import { PackObjectStoreLive } from "./PackObjectStore.ts";
import { PackedRefsStoreLive } from "./PackedRefsStore.ts";
import { RefReaderLive } from "./RefReader.ts";
import { RefStoreLive } from "./RefStore.ts";
import { RefTransactionLive } from "./RefTransaction.ts";
import { ReflogStoreLive } from "./ReflogStore.ts";
import { RepositoryIdentityLive } from "./RepositoryIdentity.ts";
import { GitFilesLive } from "./internal/GitFiles.ts";
import { GitStoreRuntime } from "./internal/runtime.ts";

export type GitStoreInstanceKey = string;

export type GitStoreInstanceDescriptor = {
  readonly config: GitStoreConfig;
  readonly key: GitStoreKey;
};

export const encodeGitStoreInstanceKey = (descriptor: GitStoreInstanceDescriptor): string =>
  JSON.stringify(descriptor);

export const decodeGitStoreInstanceKey = (value: string): GitStoreInstanceDescriptor =>
  JSON.parse(value) as GitStoreInstanceDescriptor;

export const makeGitStoreLayer = (descriptor: GitStoreInstanceDescriptor) => {
  const runtime = Layer.succeed(
    GitStoreRuntime,
    GitStoreRuntime.of({
      config: descriptor.config,
      key: descriptor.key,
    }),
  );
  const core = Layer.mergeAll(runtime, GitFilesLive, ObjectCodecLive);
  const looseObjects = LooseObjectStoreLive.pipe(Layer.provideMerge(core));
  const packIndexes = PackIndexStoreLive.pipe(Layer.provideMerge(looseObjects));
  const packObjects = PackObjectStoreLive.pipe(Layer.provideMerge(packIndexes));
  const objects = ObjectStoreLive.pipe(Layer.provideMerge(packObjects));
  const looseRefs = LooseRefStoreLive.pipe(Layer.provideMerge(objects));
  const packedRefs = PackedRefsStoreLive.pipe(Layer.provideMerge(looseRefs));
  const refReader = RefReaderLive.pipe(Layer.provideMerge(packedRefs));
  const refTransactions = RefTransactionLive.pipe(Layer.provideMerge(refReader));
  const refs = RefStoreLive.pipe(Layer.provideMerge(refTransactions));
  const changes = GitStoreChangesLive.pipe(Layer.provideMerge(refs));
  const commitWriter = CommitWriterLive.pipe(Layer.provideMerge(refTransactions));
  const git = GitLive.pipe(Layer.provide(NodeServices.layer));
  const remoteTransport = GitRemoteTransportLive.pipe(
    Layer.provideMerge(Layer.mergeAll(changes, git)),
  );
  const sync = GitStoreSyncLive.pipe(Layer.provideMerge(Layer.mergeAll(remoteTransport, commitWriter)));
  const reflog = ReflogStoreLive.pipe(Layer.provideMerge(sync));
  const store = GitStoreLive.pipe(Layer.provideMerge(Layer.mergeAll(commitWriter, changes)));
  const identity = RepositoryIdentityLive.pipe(
    Layer.provideMerge(Layer.mergeAll(store, remoteTransport, commitWriter)),
  );

  return EventStoreLive.pipe(Layer.provideMerge(Layer.mergeAll(identity, sync, reflog)));
};

export class GitStoreInstances extends LayerMap.Service<GitStoreInstances>()(
  "@cycle/git-store/GitStoreInstances",
  {
    idleTimeToLive: "5 minutes",
    lookup: (key: GitStoreInstanceKey) =>
      Layer.fresh(makeGitStoreLayer(decodeGitStoreInstanceKey(key))),
  },
) {}

export const GitStoreInstancesLive = GitStoreInstances.layer;
