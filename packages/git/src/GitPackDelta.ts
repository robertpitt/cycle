import { Effect } from "effect";
import { GitAdapterError } from "./GitErrors.ts";

export const applyDelta = (
  base: Uint8Array,
  delta: Uint8Array,
  packPath: string,
): Effect.Effect<Uint8Array, GitAdapterError> =>
  Effect.gen(function* () {
    const baseSize = readDeltaSize(delta, 0);
    const resultSize = readDeltaSize(delta, baseSize.nextOffset);

    if (baseSize.size !== base.byteLength) {
      return yield* new GitAdapterError({
        operation: "filesystem pack read",
        message: `Delta base size mismatch in ${packPath}: expected ${base.byteLength}, got ${baseSize.size}`,
      });
    }

    const output = new Uint8Array(resultSize.size);
    let readOffset = resultSize.nextOffset;
    let writeOffset = 0;

    while (readOffset < delta.byteLength) {
      const instruction = delta[readOffset++];

      if (instruction === undefined) break;

      if ((instruction & 0x80) !== 0) {
        const copy = readCopyInstruction(delta, readOffset, instruction);
        const end = copy.offset + copy.size;

        if (end > base.byteLength || writeOffset + copy.size > output.byteLength) {
          return yield* new GitAdapterError({
            operation: "filesystem pack read",
            message: `Delta copy is outside bounds in ${packPath}`,
          });
        }

        output.set(base.subarray(copy.offset, end), writeOffset);
        readOffset = copy.nextOffset;
        writeOffset += copy.size;
      } else if (instruction !== 0) {
        const size = instruction & 0x7f;
        const end = readOffset + size;

        if (end > delta.byteLength || writeOffset + size > output.byteLength) {
          return yield* new GitAdapterError({
            operation: "filesystem pack read",
            message: `Delta insert is outside bounds in ${packPath}`,
          });
        }

        output.set(delta.subarray(readOffset, end), writeOffset);
        readOffset = end;
        writeOffset += size;
      } else {
        return yield* new GitAdapterError({
          operation: "filesystem pack read",
          message: `Invalid delta instruction in ${packPath}`,
        });
      }
    }

    return writeOffset === output.byteLength
      ? output
      : yield* new GitAdapterError({
          operation: "filesystem pack read",
          message: `Delta result size mismatch in ${packPath}: expected ${output.byteLength}, got ${writeOffset}`,
        });
  });

const readDeltaSize = (
  delta: Uint8Array,
  offset: number,
): { readonly nextOffset: number; readonly size: number } => {
  let size = 0;
  let shift = 0;
  let byte = 0;

  do {
    byte = delta[offset++] ?? 0;
    size += (byte & 0x7f) * 2 ** shift;
    shift += 7;
  } while ((byte & 0x80) !== 0);

  return { nextOffset: offset, size };
};

const readCopyInstruction = (
  delta: Uint8Array,
  offset: number,
  instruction: number,
): { readonly nextOffset: number; readonly offset: number; readonly size: number } => {
  let copyOffset = 0;
  let copySize = 0;

  if ((instruction & 0x01) !== 0) copyOffset += delta[offset++] ?? 0;
  if ((instruction & 0x02) !== 0) copyOffset += (delta[offset++] ?? 0) * 2 ** 8;
  if ((instruction & 0x04) !== 0) copyOffset += (delta[offset++] ?? 0) * 2 ** 16;
  if ((instruction & 0x08) !== 0) copyOffset += (delta[offset++] ?? 0) * 2 ** 24;
  if ((instruction & 0x10) !== 0) copySize += delta[offset++] ?? 0;
  if ((instruction & 0x20) !== 0) copySize += (delta[offset++] ?? 0) * 2 ** 8;
  if ((instruction & 0x40) !== 0) copySize += (delta[offset++] ?? 0) * 2 ** 16;

  return {
    nextOffset: offset,
    offset: copyOffset,
    size: copySize === 0 ? 0x10000 : copySize,
  };
};
