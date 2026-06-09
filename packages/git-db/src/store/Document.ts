import { Effect, Schema } from "effect";
import { invalidJsonDocument, type InvalidJsonDocumentError } from "../errors/index.ts";
import { bytesToString } from "../internals/bytes.ts";

export class Document extends Schema.Class<Document>("@cycle/git-db/Document")({
  bytes: Schema.Uint8Array,
  objectId: Schema.String,
  path: Schema.String,
}) {
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

export const parseDocumentJson = <T = unknown>(
  document: Document,
): Effect.Effect<T, InvalidJsonDocumentError> =>
  Effect.try({
    catch: (cause) =>
      invalidJsonDocument(`Invalid JSON document at ${document.path}`, {
        cause,
        path: document.path,
      }),
    try: () => document.json<T>(),
  });
