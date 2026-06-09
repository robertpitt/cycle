export type CollectionIndexKey<T> = T extends object ? Extract<keyof T, string> : string;

export type CollectionOptions<T = unknown> = {
  readonly indexes?: ReadonlyArray<CollectionIndexKey<T>>;
};
