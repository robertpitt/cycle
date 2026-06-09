import type { CollectionEntry } from "./CollectionEntry.ts";

export type CollectionPage<T = unknown> = {
  readonly entries: ReadonlyArray<CollectionEntry<T>>;
  readonly nextCursor?: string;
};
