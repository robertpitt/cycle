import { Effect, Schema } from "effect";
import { InvalidJsonDocumentError } from "./GitStoreErrors.ts";
import type { ObjectId, StorePath } from "./GitStoreSchemas.ts";
import { bytesFromString, bytesToString } from "./internal/bytes.ts";
import { encodeSchemaValue, stableJsonBytes } from "./internal/json.ts";

export type DocumentInput =
  | { readonly _tag: "Bytes"; readonly bytes: Uint8Array }
  | { readonly _tag: "Text"; readonly encoding?: string; readonly text: string }
  | { readonly _tag: "Json"; readonly schema?: Schema.Top; readonly value: unknown };

export class Document extends Schema.Class<Document>("@cycle/git-store/Document")({
  bytes: Schema.Uint8Array,
  objectId: Schema.String,
  path: Schema.String,
}) {
  static bytes(bytes: Uint8Array): DocumentInput {
    return { _tag: "Bytes", bytes };
  }

  static text(text: string, encoding = "utf-8"): DocumentInput {
    return { _tag: "Text", encoding, text };
  }

  static json(value: unknown, schema?: Schema.Top): DocumentInput {
    return { _tag: "Json", schema, value };
  }

  get size(): number {
    return this.bytes.byteLength;
  }

  text(encoding = "utf-8"): string {
    return bytesToString(this.bytes, encoding);
  }

  json<T = unknown>(): T {
    return JSON.parse(this.text()) as T;
  }
}

export const encodeDocumentInput = (
  input: DocumentInput,
  path?: string,
): Effect.Effect<Uint8Array, InvalidJsonDocumentError> => {
  switch (input._tag) {
    case "Bytes":
      return Effect.succeed(input.bytes);
    case "Text":
      if (input.encoding !== undefined && input.encoding.toLowerCase() !== "utf-8") {
        return Effect.try({
          try: () => new TextEncoder().encode(input.text),
          catch: (cause) =>
            new InvalidJsonDocumentError({
              cause,
              message: `Unsupported text encoding: ${input.encoding}`,
              path,
            }),
        });
      }

      return Effect.succeed(bytesFromString(input.text));
    case "Json":
      return input.schema === undefined
        ? stableJsonBytes(input.value, {
            message: "Cannot encode JSON document",
            path,
            trailingNewline: true,
          })
        : (encodeSchemaValue(input.schema, input.value, {
            message: "Cannot encode JSON document",
            path,
          }).pipe(
            Effect.flatMap((json) =>
              stableJsonBytes(json, {
                message: "Cannot encode JSON document",
                path,
                trailingNewline: true,
              }),
            ),
          ) as Effect.Effect<Uint8Array, InvalidJsonDocumentError>);
  }
};

export const makeDocument = (path: StorePath, objectId: ObjectId, bytes: Uint8Array): Document =>
  new Document({
    bytes,
    objectId,
    path,
  });

export const parseDocumentJson = <T = unknown>(
  document: Document,
): Effect.Effect<T, InvalidJsonDocumentError> =>
  decodeJson(document, Schema.Unknown).pipe(Effect.map((value) => value as T));

export const decodeJson = <S extends Schema.Top>(
  document: Document,
  schema: S,
): Effect.Effect<S["Type"], InvalidJsonDocumentError, S["DecodingServices"]> =>
  Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.toCodecJson(schema)))(document.text(), {
    errors: "all",
  }).pipe(
    Effect.mapError(
      (cause) =>
        new InvalidJsonDocumentError({
          cause,
          message: `Invalid JSON document at ${document.path}: ${String(cause)}`,
          path: document.path,
        }),
    ),
  );
