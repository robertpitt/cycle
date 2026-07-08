import { Effect } from "effect";
import { InvalidObjectIdError, ObjectDecodeError, ObjectEncodingError } from "../GitStoreErrors.ts";
import type { GitObjectType, ObjectId, TreeEntry } from "../GitStoreSchemas.ts";
import { bytesFromString, bytesToHex, concatBytes, hexToBytes } from "./bytes.ts";
import { gitObjectHeaderPattern } from "./patterns.ts";
import { validateObjectId } from "./refs.ts";

export type GitObject = {
  readonly body: Uint8Array;
  readonly type: GitObjectType;
};

export const canonicalBytes = (type: GitObjectType, body: Uint8Array): Uint8Array =>
  concatBytes([bytesFromString(`${type} ${body.byteLength}\0`), body]);

export const decodeObjectBytes = (
  bytes: Uint8Array,
  objectId?: string,
): Effect.Effect<GitObject, ObjectDecodeError> =>
  Effect.gen(function* () {
    const headerEnd = bytes.indexOf(0);

    if (headerEnd === -1) {
      return yield* new ObjectDecodeError({
        message: "Git object is missing a header terminator",
        objectId,
      });
    }

    const header = new TextDecoder().decode(bytes.subarray(0, headerEnd));
    const match = gitObjectHeaderPattern.exec(header);

    if (match === null) {
      return yield* new ObjectDecodeError({
        message: `Invalid Git object header: ${header}`,
        objectId,
      });
    }

    const size = Number.parseInt(match[2] ?? "", 10);
    const body = bytes.subarray(headerEnd + 1);

    if (body.byteLength !== size) {
      return yield* new ObjectDecodeError({
        message: `Git object expected ${size} bytes but contained ${body.byteLength}`,
        objectId,
      });
    }

    return {
      body,
      type: match[1] as GitObjectType,
    };
  });

export const objectPathSegmentBytes = (
  objectId: ObjectId,
): Effect.Effect<Uint8Array, InvalidObjectIdError> =>
  Effect.suspend(() => {
    const bytes = hexToBytes(objectId);

    return bytes === null
      ? Effect.fail(
          new InvalidObjectIdError({
            message: `Invalid object id: ${objectId}`,
            objectId,
          }),
        )
      : Effect.succeed(bytes);
  });

export const bytesToObjectId = (bytes: Uint8Array): Effect.Effect<ObjectId, InvalidObjectIdError> =>
  validateObjectId(bytesToHex(bytes));

const treeSortName = (entry: Pick<TreeEntry, "name" | "type">): Uint8Array =>
  bytesFromString(entry.type === "tree" ? `${entry.name}/` : entry.name);

export const compareTreeEntries = (
  left: Pick<TreeEntry, "name" | "type">,
  right: Pick<TreeEntry, "name" | "type">,
): number => {
  const leftName = treeSortName(left);
  const rightName = treeSortName(right);
  const length = Math.min(leftName.byteLength, rightName.byteLength);

  for (let index = 0; index < length; index += 1) {
    const diff = (leftName[index] ?? 0) - (rightName[index] ?? 0);

    if (diff !== 0) return diff;
  }

  return leftName.byteLength - rightName.byteLength;
};

export const encodeTreeBody = (
  entries: ReadonlyArray<Omit<TreeEntry, "path">>,
): Effect.Effect<Uint8Array, ObjectEncodingError | InvalidObjectIdError> =>
  Effect.gen(function* () {
    const parts: Array<Uint8Array> = [];

    for (const entry of [...entries].sort(compareTreeEntries)) {
      const mode = entry.mode === "040000" ? "40000" : entry.mode;

      parts.push(bytesFromString(`${mode} ${entry.name}\0`));
      parts.push(yield* objectPathSegmentBytes(entry.objectId));
    }

    return concatBytes(parts);
  });
