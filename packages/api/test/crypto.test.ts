import { strict as assert } from "node:assert";
import { Crypto, Effect, PlatformError, Result } from "effect";
import { describe, it } from "vitest";
import { timingSafeTokenEqualWithCrypto } from "../src/http/handlers/crypto.ts";

const digestFailure = PlatformError.systemError({
  _tag: "Unknown",
  description: "digest unavailable",
  method: "digest",
  module: "Crypto",
});

const failingCrypto = Crypto.make({
  digest: () => Effect.fail(digestFailure),
  randomBytes: (size) => new Uint8Array(size),
});

describe("timingSafeTokenEqualWithCrypto", () => {
  it("fails instead of authorizing when token digesting fails", async () => {
    const result = await Effect.runPromise(
      Effect.result(timingSafeTokenEqualWithCrypto(failingCrypto, "token", "token")),
    );

    assert.equal(Result.isFailure(result), true);
  });
});
