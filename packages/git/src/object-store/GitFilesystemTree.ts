import { Effect } from "effect";
import type { ObjectId, TreeEntry } from "../schemas/index.ts";
import { gitAdapterError, type GitAdapterError } from "../errors/index.ts";
import { bytesFromString, bytesToString, concatBytes } from "../internals/bytes.ts";
import { writeObject } from "./GitFilesystemObject.ts";
import type { FilesystemRuntime } from "./GitFilesystemTypes.ts";

export const readFilesystemTree = (
  payload: Uint8Array,
): Effect.Effect<ReadonlyArray<TreeEntry>, GitAdapterError> =>
  Effect.gen(function* () {
    const entries: Array<TreeEntry> = [];
    let offset = 0;

    while (offset < payload.byteLength) {
      const modeEnd = payload.indexOf(0x20, offset);

      if (modeEnd === -1) {
        return yield* Effect.fail(
          gitAdapterError("filesystem readTree", "Tree entry is missing mode separator"),
        );
      }

      const nameEnd = payload.indexOf(0, modeEnd + 1);

      if (nameEnd === -1) {
        return yield* Effect.fail(
          gitAdapterError("filesystem readTree", "Tree entry is missing name terminator"),
        );
      }

      const objectStart = nameEnd + 1;
      const objectEnd = objectStart + 20;

      if (objectEnd > payload.byteLength) {
        return yield* Effect.fail(
          gitAdapterError("filesystem readTree", "Tree entry is missing object id bytes"),
        );
      }

      const mode = bytesToString(payload.subarray(offset, modeEnd));
      const name = bytesToString(payload.subarray(modeEnd + 1, nameEnd));
      const objectId = bytesToHex(payload.subarray(objectStart, objectEnd));

      entries.push({
        mode: storeTreeMode(mode),
        name,
        objectId,
        type: mode === "40000" || mode === "040000" ? "tree" : "blob",
      });
      offset = objectEnd;
    }

    return entries;
  });

export const writeFilesystemTree = (
  runtime: FilesystemRuntime,
  gitDir: string,
  entries: ReadonlyArray<TreeEntry>,
): Effect.Effect<ObjectId, GitAdapterError> =>
  Effect.gen(function* () {
    const parts: Array<Uint8Array> = [];

    for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
      parts.push(bytesFromString(`${gitTreeMode(entry.mode)} ${entry.name}\0`));
      parts.push(yield* hexToBytes(entry.objectId, "filesystem writeTree"));
    }

    return yield* writeObject(runtime, gitDir, "tree", concatBytes(parts));
  });

const hexToBytes = (hex: string, operation: string): Effect.Effect<Uint8Array, GitAdapterError> =>
  Effect.try({
    try: () => {
      if (!/^[0-9a-fA-F]{40}$/u.test(hex)) {
        throw new Error(`Invalid Git object id: ${hex}`);
      }

      const bytes = new Uint8Array(20);

      for (let index = 0; index < hex.length; index += 2) {
        bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16);
      }

      return bytes;
    },
    catch: (cause) =>
      gitAdapterError(operation, cause instanceof Error ? cause.message : String(cause), { cause }),
  });

const bytesToHex = (bytes: Uint8Array): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const gitTreeMode = (mode: string): string => (mode === "040000" ? "40000" : mode);

const storeTreeMode = (mode: string): string => (mode === "40000" ? "040000" : mode);
