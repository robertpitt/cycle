import type { ReadOptions } from "./ReadOptions.ts";

export type CollectionListOptions = ReadOptions;

export type CollectionPageOptions = ReadOptions & {
  readonly cursor?: string;
  readonly limit?: number;
};
