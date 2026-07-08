import { Context, Effect, Layer } from "effect";

export type ReflogStoreShape = {
  readonly append: () => Effect.Effect<void>;
};

export class ReflogStore extends Context.Service<ReflogStore, ReflogStoreShape>()(
  "@cycle/git-store/ReflogStore",
) {}

export const ReflogStoreLive = Layer.succeed(
  ReflogStore,
  ReflogStore.of({
    append: () => Effect.void,
  }),
);
