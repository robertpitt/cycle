import { Crypto, Effect, Encoding, Redacted } from "effect";

export const makeRedactedToken = (value: string): Redacted.Redacted<string> =>
  Redacted.make(value, { label: "Cycle API token" });

export const redactedTokenValue = (token: Redacted.Redacted<string>): string =>
  Redacted.value(token);

export const generateStaticToken: Effect.Effect<
  Redacted.Redacted<string>,
  unknown,
  Crypto.Crypto
> = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const bytes = yield* crypto.randomBytes(32);
  return makeRedactedToken(Encoding.encodeBase64Url(bytes));
});
