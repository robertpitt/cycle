import { Crypto, Effect } from "effect";
import { Headers } from "effect/unstable/http";

const textEncoder = new TextEncoder();

export const requestIdFromHeaders = (
  headers: Headers.Headers,
): Effect.Effect<string, never, Crypto.Crypto> =>
  Effect.flatMap(Crypto.Crypto, (crypto) => requestIdFromHeadersWithCrypto(crypto, headers));

export const requestIdFromHeadersWithCrypto = (
  crypto: Crypto.Crypto,
  headers: Headers.Headers,
): Effect.Effect<string> => {
  const requestId = headers["x-request-id"];
  if (requestId !== undefined && requestId.length > 0) return Effect.succeed(requestId);

  return Effect.gen(function* () {
    const uuid = yield* crypto.randomUUIDv4.pipe(Effect.catch(() => Effect.succeed("unknown")));

    return `req_${uuid}`;
  });
};

export const timingSafeTokenEqualWithCrypto = (
  crypto: Crypto.Crypto,
  supplied: string,
  expected: string,
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const [suppliedDigest, expectedDigest] = yield* Effect.all(
      [
        crypto.digest("SHA-256", textEncoder.encode(supplied)),
        crypto.digest("SHA-256", textEncoder.encode(expected)),
      ] as const,
      { concurrency: "unbounded" },
    ).pipe(Effect.catch(() => Effect.succeed([new Uint8Array(), new Uint8Array()] as const)));

    return constantTimeEqual(suppliedDigest, expectedDigest);
  });

const constantTimeEqual = (left: Uint8Array, right: Uint8Array): boolean => {
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;

  for (let index = 0; index < length; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }

  return diff === 0;
};
