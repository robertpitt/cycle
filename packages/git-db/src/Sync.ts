import type { Effect } from "effect";
import type { SyncOptions, SyncResult } from "./GitDbSchemas.ts";
import type { GitDbError } from "./GitDbErrors.ts";
import type { StoreServiceShape } from "./Store.ts";

export type { SyncOptions, SyncResult };

export const run = (
  store: StoreServiceShape,
  options?: SyncOptions,
): Effect.Effect<SyncResult, GitDbError> => store.sync(options);
