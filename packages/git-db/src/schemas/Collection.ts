import { Schema } from "effect";
import { Document } from "./Document.ts";
import { CollectionName, DocumentId } from "./Identifier.ts";
import { StorePath } from "./Path.ts";

export const CollectionInfo = <TMeta extends Schema.Top = typeof Schema.Unknown>(
  meta: TMeta = Schema.Unknown as unknown as TMeta,
) =>
  Schema.Struct({
    meta: Schema.optional(meta),
    name: CollectionName,
    path: StorePath,
  });

export type CollectionInfo<TMeta = unknown> = {
  readonly meta?: TMeta;
  readonly name: string;
  readonly path: string;
};

export const CollectionEntry = <T extends Schema.Top = typeof Schema.Unknown>(
  value: T = Schema.Unknown as unknown as T,
) =>
  Schema.Struct({
    document: Document,
    id: DocumentId,
    path: StorePath,
    value,
  });

export type CollectionEntry<T = unknown> = {
  readonly document: Document;
  readonly id: string;
  readonly path: string;
  readonly value: T;
};
