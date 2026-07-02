import { GitAdapterError } from "../errors/index.ts";

export const dataView = (bytes: Uint8Array): DataView =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

export const bytesToHex = (bytes: Uint8Array): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

export const objectIdBytes = (id: string): Uint8Array | null => {
  if (!/^[0-9a-fA-F]{40}$/u.test(id)) return null;

  const bytes = new Uint8Array(20);

  for (let index = 0; index < id.length; index += 2) {
    bytes[index / 2] = Number.parseInt(id.slice(index, index + 2), 16);
  }

  return bytes;
};

export const compareObjectIdAt = (
  bytes: Uint8Array,
  offset: number,
  target: Uint8Array,
): number => {
  for (let index = 0; index < target.byteLength; index += 1) {
    const left = bytes[offset + index] ?? -1;
    const right = target[index] ?? -1;

    if (left !== right) return left - right;
  }

  return 0;
};

export const mapPackFsError =
  (operation: string, target: string) =>
  (cause: unknown): GitAdapterError =>
    new GitAdapterError({
      operation,
      message: `${operation} failed for ${target}: ${errorMessage(cause)}`,
      cause,
    });

const errorMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);
