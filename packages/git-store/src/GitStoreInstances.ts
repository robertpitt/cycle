import { Layer, LayerMap } from "effect";
import { CommitWriterLive } from "./CommitWriter.ts";
import { EventStoreLive } from "./EventStore.ts";
import { GitStoreLive } from "./GitStore.ts";
import type { GitStoreConfig, GitStoreKey } from "./GitStoreSchemas.ts";
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
  const reflog = ReflogStoreLive.pipe(Layer.provideMerge(refs));
  const commitWriter = CommitWriterLive.pipe(Layer.provideMerge(reflog));
  const store = GitStoreLive.pipe(Layer.provideMerge(commitWriter));
  const identity = RepositoryIdentityLive.pipe(Layer.provideMerge(store));

  return EventStoreLive.pipe(Layer.provideMerge(identity));
};

export class GitStoreInstances extends LayerMap.Service<GitStoreInstances>()(
  "@cycle/git-store/GitStoreInstances",
  {
    idleTimeToLive: "5 minutes",
    lookup: (key: GitStoreInstanceKey) => makeGitStoreLayer(decodeGitStoreInstanceKey(key)),
  },
) {}

export const GitStoreInstancesLive = GitStoreInstances.layer;
