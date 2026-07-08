import { NodeServices } from "@effect/platform-node";
import { Layer } from "effect";
import { GitStores, GitStoresLive } from "../GitStores.ts";
import { RepositoryPathsLive } from "../RepositoryPaths.ts";

export const TestIdentity = {
  email: "cycle@example.invalid",
  name: "Cycle Test",
} as const;

export const withTestIdentity = <Options extends object>(
  options: Options,
): Omit<Options, "identity"> & { readonly identity: typeof TestIdentity } => ({
  ...options,
  identity: TestIdentity,
});

export const GitStoresTestLive: Layer.Layer<GitStores> = GitStoresLive.pipe(
  Layer.provide(
    Layer.mergeAll(
      NodeServices.layer,
      RepositoryPathsLive.pipe(Layer.provide(NodeServices.layer)),
    ),
  ),
) as Layer.Layer<GitStores>;
