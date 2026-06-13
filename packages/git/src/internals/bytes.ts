import { Stream } from "effect";

const utf8Encoder = new TextEncoder();

export const bytesFromString = (value: string): Uint8Array => utf8Encoder.encode(value);

export const bytesToString = (bytes: Uint8Array, encoding = "utf-8"): string =>
  new TextDecoder(encoding).decode(bytes);

export const concatBytes = (chunks: Iterable<Uint8Array>): Uint8Array => {
  const parts = [...chunks];
  const size = parts.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(size);
  let offset = 0;

  for (const chunk of parts) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
};

export const inputToStream = (
  input: Uint8Array | string | undefined,
): Stream.Stream<Uint8Array> | undefined =>
  input === undefined
    ? undefined
    : Stream.make(typeof input === "string" ? bytesFromString(input) : input);
