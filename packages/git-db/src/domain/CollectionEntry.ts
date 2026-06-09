import { Schema } from "effect";
import { Document } from "../store/Document.ts";

export const CollectionEntry = <T extends Schema.Top = typeof Schema.Unknown>(
  value: T = Schema.Unknown as unknown as T,
) =>
  Schema.Struct({
    document: Document,
    id: Schema.String,
    path: Schema.String,
    value,
  });

export type CollectionEntry<T = unknown> = {
  readonly document: Document;
  readonly id: string;
  readonly path: string;
  readonly value: T;
};
