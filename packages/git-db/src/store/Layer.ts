import { NodeCrypto, NodeServices } from "@effect/platform-node";
import * as GitCli from "@cycle/git/object-store/GitCli";
import * as GitFilesystem from "@cycle/git/object-store/GitFilesystem";
import * as GitInMemory from "@cycle/git/object-store/GitInMemory";
import { Effect, FileSystem, Layer, Path } from "effect";
import * as Store from "./Store.ts";

export type Options = Store.Options;

const StoreTestPlatform = Layer.mergeAll(
  Path.layer,
  FileSystem.layerNoop({
    access: () => Effect.void,
  }),
);

export const cli = (options: Options = {}) => {
  const platform = NodeServices.layer;
  const store = Store.layer(options).pipe(Layer.provide(platform));
  const git = GitCli.layer.pipe(Layer.provide(platform));

  return Store.live.pipe(Layer.provide(Layer.mergeAll(store, git, platform)));
};

export const filesystem = (options: Options = {}) => {
  const platform = NodeServices.layer;
  const store = Store.layer(options).pipe(Layer.provide(platform));
  const git = GitFilesystem.layer.pipe(Layer.provide(platform));

  return Store.live.pipe(Layer.provide(Layer.mergeAll(store, git, platform)));
};

export const layer = cli;

export const GitDbLive = cli;
export const GitDbFilesystem = filesystem;

export const GitDbInMemory = (options: Options = {}) => {
  const store = Store.layer({
    ...options,
    verifyGitDir: false,
  }).pipe(Layer.provide(StoreTestPlatform));
  const crypto = NodeCrypto.layer;
  const git = GitInMemory.layer.pipe(Layer.provide(crypto));

  return Store.live.pipe(Layer.provide(Layer.mergeAll(store, git, crypto)));
};
