import { Effect, Schema } from "effect";
import { InvalidJsonDocumentError } from "../GitStoreErrors.ts";
import { bytesFromString } from "./bytes.ts";

export const encodeSchemaValue = <S extends Schema.Top>(
  schema: S,
  value: unknown,
  options: {
    readonly message: string;
    readonly path?: string;
  },
): Effect.Effect<Schema.Json, InvalidJsonDocumentError, S["EncodingServices"]> =>
  Schema.encodeUnknownEffect(Schema.toCodecJson(schema))(value, { errors: "all" }).pipe(
    Effect.mapError(
      (cause) =>
        new InvalidJsonDocumentError({
          cause,
          message: `${options.message}: ${String(cause)}`,
          path: options.path,
        }),
    ),
  );

export const stableJson = (
  value: unknown,
  options: {
    readonly message: string;
    readonly path?: string;
  },
): Effect.Effect<string, InvalidJsonDocumentError> =>
  Effect.try({
    try: () => stableStringify(value),
    catch: (cause) =>
      new InvalidJsonDocumentError({
        cause,
        message: cause instanceof Error ? cause.message : options.message,
        path: options.path,
      }),
  });

export const stableJsonBytes = (
  value: unknown,
  options: {
    readonly message: string;
    readonly path?: string;
    readonly trailingNewline?: boolean;
  },
): Effect.Effect<Uint8Array, InvalidJsonDocumentError> =>
  stableJson(value, options).pipe(
    Effect.map((json) => bytesFromString(options.trailingNewline === true ? `${json}\n` : json)),
  );

export const stableStringify = (value: unknown): string => JSON.stringify(normalizeJson(value));

const normalizeJson = (value: unknown): unknown => {
  if (value === undefined) {
    throw new TypeError("Cannot encode undefined as JSON");
  }

  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : normalizeJson(item)));
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};

  for (const key of Object.keys(input).sort()) {
    const normalized = normalizeJson(input[key]);

    if (normalized !== undefined) output[key] = normalized;
  }

  return output;
};
