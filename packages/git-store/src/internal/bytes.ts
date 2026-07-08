import { Encoding, Result } from "effect";

const utf8Encoder = new TextEncoder();

export const bytesFromString = (value: string): Uint8Array => utf8Encoder.encode(value);

export const bytesToString = (bytes: Uint8Array, encoding = "utf-8"): string =>
  new TextDecoder(encoding).decode(bytes);

export const concatBytes = (chunks: Iterable<Uint8Array>): Uint8Array => {
  const parts = [...chunks];
  const size = parts.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(size);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }

  return output;
};

export const bytesToHex = (bytes: Uint8Array): string => Encoding.encodeHex(bytes).toLowerCase();

export const hexToBytes = (hex: string): Uint8Array | null => {
  const decoded = Encoding.decodeHex(hex);

  return Result.isSuccess(decoded) ? decoded.success : null;
};

export const dataView = (bytes: Uint8Array): DataView =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

export const compareBytes = (left: Uint8Array, right: Uint8Array): number => {
  const length = Math.min(left.byteLength, right.byteLength);

  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);

    if (diff !== 0) return diff;
  }

  return left.byteLength - right.byteLength;
};
