import { Effect } from "effect";
import { invalidJsonDocument, type InvalidJsonDocumentError } from "../errors/index.ts";
import { bytesFromString } from "../internals/bytes.ts";

export const encodeValue = (value: unknown): Effect.Effect<Uint8Array, InvalidJsonDocumentError> =>
  Effect.try({
    catch: (cause) =>
      invalidJsonDocument(cause instanceof Error ? cause.message : "Cannot encode document", {
        cause,
      }),
    try: () => {
      if (value instanceof Uint8Array) return value;
      if (typeof value === "string") return bytesFromString(value);

      return bytesFromString(`${stableStringify(value)}\n`);
    },
  });

const stableStringify = (value: unknown): string => JSON.stringify(normalizeJson(value));

const normalizeJson = (value: unknown): unknown => {
  if (value === undefined) {
    throw new TypeError("Cannot encode undefined as a document");
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : normalizeJson(item)));
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};

  for (const key of Object.keys(input).sort()) {
    if (input[key] === undefined) continue;

    const normalized = normalizeJson(input[key]);

    if (normalized !== undefined) {
      output[key] = normalized;
    }
  }

  return output;
};
