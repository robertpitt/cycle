import { Crypto, Effect } from "effect";
import { bytesFromString, concatBytes } from "./bytes.ts";

export const sha1Hex = (value: string | Uint8Array): Effect.Effect<string, never, Crypto.Crypto> =>
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const bytes = typeof value === "string" ? bytesFromString(value) : value;
    const digest = yield* crypto.digest("SHA-1", bytes).pipe(Effect.orDie);

    return bytesToHex(digest);
  });

export const gitObjectId = (
  type: string,
  payload: Uint8Array,
): Effect.Effect<string, never, Crypto.Crypto> =>
  sha1Hex(concatBytes([bytesFromString(`${type} ${payload.byteLength}\0`), payload]));

const bytesToHex = (bytes: Uint8Array): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
