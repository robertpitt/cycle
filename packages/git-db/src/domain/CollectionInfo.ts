import { Schema } from "effect";

export const CollectionInfo = <TMeta extends Schema.Top = typeof Schema.Unknown>(
  meta: TMeta = Schema.Unknown as unknown as TMeta,
) =>
  Schema.Struct({
    meta: Schema.optional(meta),
    name: Schema.String,
    path: Schema.String,
  });

export type CollectionInfo<TMeta = unknown> = {
  readonly meta?: TMeta;
  readonly name: string;
  readonly path: string;
};
